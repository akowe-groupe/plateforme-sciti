/**
 * @file Service des comptes : étudiants, professeurs (comptes liés), RP, adjoints, super
 * étudiants, réinitialisation du mot de passe.
 * Règles de gestion : RG-01 à RG-06, RG-08, RG-10, RG-31 (super étudiant).
 *
 * Personne ne crée son propre compte (RG-01) : toutes ces fonctions sont réservées à
 * l'administration. Chaque compte créé reçoit un mot de passe temporaire tiré au hasard,
 * renvoyé une seule fois dans la réponse, et doit le changer à la première connexion (RG-06).
 */
import { db } from '../db/knex.js';
import { HttpError } from '../utils/http-error.js';
import { assertManagesProgram, assertRole, forbidden, managesProgram, notFound } from './access.js';
import { toUser } from './auth.service.js';
import { generateAdminCode, generateTemporaryPassword, hashPassword } from './password.service.js';

const UNIQUE_VIOLATION = '23505';
const emailTaken = () =>
  new HttpError(409, 'EMAIL_ALREADY_USED', 'Cette adresse e-mail est déjà utilisée.');

/** Rôles qui administrent des comptes (directeur, RP, adjoint). */
const ADMIN_ROLES = ['director', 'programHead', 'assistant'];

// ------------------------------------------------------------------ outils internes

/** Retrouve la filière d'une année, ou lance une erreur 404. */
async function programOfLevel(levelId, conn) {
  const level = await conn('levels').where({ id: levelId }).first();
  if (!level) throw notFound('Année introuvable.');
  return level.program_id;
}

/** Filières des modules donnés, ou erreur 404 si un module n'existe pas. */
async function modulesWithProgram(moduleIds, conn) {
  const rows = await conn('modules as m')
    .join('semesters as s', 's.id', 'm.semester_id')
    .join('levels as l', 'l.id', 's.level_id')
    .whereIn('m.id', moduleIds)
    .select('m.id', 'l.program_id', 'l.id as level_id');
  if (rows.length !== new Set(moduleIds).size) throw notFound('Module introuvable.');
  return rows;
}

/** Retrouve un utilisateur, ou lance une erreur 404. */
async function getUser(userId, conn) {
  const user = await conn('users').where({ id: userId }).first();
  if (!user) throw notFound('Compte introuvable.');
  return user;
}

/** Filières auxquelles un compte est rattaché, selon son rôle. */
async function programsOfUser(user, conn) {
  if (user.program_id) return [user.program_id];
  if (user.role === 'student') {
    const rows = await conn('enrollments as e')
      .join('levels as l', 'l.id', 'e.level_id')
      .where('e.student_id', user.id)
      .distinct('l.program_id');
    return rows.map((r) => r.program_id);
  }
  if (user.role === 'teacher') {
    const rows = await conn('teacher_assignments as ta')
      .join('modules as m', 'm.id', 'ta.module_id')
      .join('semesters as s', 's.id', 'm.semester_id')
      .join('levels as l', 'l.id', 's.level_id')
      .where('ta.teacher_id', user.id)
      .distinct('l.program_id');
    return rows.map((r) => r.program_id);
  }
  return [];
}

/**
 * Crée la ligne users avec un mot de passe temporaire haché.
 * @returns {Promise<{row: object, temporaryPassword: string}>}
 */
async function insertUser(fields, conn) {
  const temporaryPassword = generateTemporaryPassword();
  try {
    const [row] = await conn('users')
      .insert({
        last_name: fields.lastName,
        first_names: fields.firstNames,
        email: fields.email,
        phone: fields.phone ?? null,
        password_hash: await hashPassword(temporaryPassword),
        must_change_password: true,
        role: fields.role,
        program_id: fields.programId ?? null,
        admin_code_hash: fields.adminCode ? await hashPassword(fields.adminCode) : null,
      })
      .returning('*');
    return { row, temporaryPassword };
  } catch (err) {
    if (err.code === UNIQUE_VIOLATION) throw emailTaken();
    throw err;
  }
}

/** Insère des affectations professeur–module ; 409 si l'une existe déjà. */
async function insertAssignments(teacherId, moduleRows, conn) {
  try {
    const rows = await conn('teacher_assignments')
      .insert(moduleRows.map((m) => ({ teacher_id: teacherId, module_id: m.id })))
      .returning('*');
    return rows.map((r) => {
      const m = moduleRows.find((x) => x.id === r.module_id);
      return {
        assignmentId: r.id,
        moduleId: r.module_id,
        programId: m.program_id,
        levelId: m.level_id,
      };
    });
  } catch (err) {
    if (err.code === UNIQUE_VIOLATION) {
      throw new HttpError(409, 'ALREADY_ASSIGNED', 'Ce professeur est déjà affecté à ce module.');
    }
    throw err;
  }
}

// ------------------------------------------------------------------ lecture

/**
 * Liste les comptes du périmètre (RG-10), avec filtres et pagination.
 * Directeur : tous les comptes. RP et adjoint : les comptes rattachés à leur filière
 * (étudiants inscrits, professeurs affectés, RP et adjoints de la filière).
 *
 * @param {object} actor
 * @param {{role?: string, programId?: string, levelId?: string, search?: string, page: number, pageSize: number}} filters
 * @param {import('knex').Knex} [conn=db]
 */
export async function listAccounts(actor, filters, conn = db) {
  assertRole(actor, ...ADMIN_ROLES);
  let programId = filters.programId;
  if (actor.role !== 'director') {
    if (programId && programId !== actor.programId) throw forbidden();
    programId = actor.programId;
  }
  if (filters.levelId) {
    assertManagesProgram(actor, await programOfLevel(filters.levelId, conn));
  }

  const query = conn('users as u');
  if (programId) {
    // Rattachement à la filière, selon le rôle du compte.
    query.where((w) =>
      w
        .where((q) =>
          q.whereIn('u.role', ['programHead', 'assistant']).andWhere('u.program_id', programId),
        )
        .orWhereExists(
          conn('enrollments as e')
            .join('levels as l', 'l.id', 'e.level_id')
            .whereRaw('e.student_id = u.id')
            .andWhere('l.program_id', programId),
        )
        .orWhereExists(
          conn('teacher_assignments as ta')
            .join('modules as m', 'm.id', 'ta.module_id')
            .join('semesters as s', 's.id', 'm.semester_id')
            .join('levels as l', 'l.id', 's.level_id')
            .whereRaw('ta.teacher_id = u.id')
            .andWhere('l.program_id', programId),
        ),
    );
  }
  if (filters.levelId) {
    query.whereExists(
      conn('enrollments as e')
        .whereRaw('e.student_id = u.id')
        .andWhere('e.level_id', filters.levelId),
    );
  }
  if (filters.role) query.where('u.role', filters.role);
  if (filters.search) {
    const like = `%${filters.search}%`;
    query.where((w) =>
      w
        .whereILike('u.last_name', like)
        .orWhereILike('u.first_names', like)
        .orWhereILike('u.email', like),
    );
  }

  const [{ total }] = await query.clone().count({ total: '*' });
  const rows = await query
    .select('u.*')
    .orderBy([{ column: 'u.last_name' }, { column: 'u.first_names' }])
    .limit(filters.pageSize)
    .offset((filters.page - 1) * filters.pageSize);

  return {
    items: rows.map(toUser),
    page: filters.page,
    pageSize: filters.pageSize,
    total: Number(total),
  };
}

/**
 * Cherche un professeur déjà enregistré, avant d'en créer un (RG-04 : une seule personne,
 * même si plusieurs RP l'ajoutent). Renvoie le minimum pour le reconnaître : nom, prénoms,
 * filières ; ni e-mail ni téléphone.
 *
 * @param {object} actor
 * @param {{lastName: string, firstNames?: string}} query
 * @param {import('knex').Knex} [conn=db]
 */
export async function searchTeachers(actor, query, conn = db) {
  assertRole(actor, ...ADMIN_ROLES);
  const rows = await conn('users')
    .where({ role: 'teacher', is_active: true })
    .whereILike('last_name', `%${query.lastName}%`)
    .modify((q) => {
      if (query.firstNames) q.whereILike('first_names', `%${query.firstNames}%`);
    })
    .orderBy(['last_name', 'first_names'])
    .limit(20);

  const programs = await conn('teacher_assignments as ta')
    .join('modules as m', 'm.id', 'ta.module_id')
    .join('semesters as s', 's.id', 'm.semester_id')
    .join('levels as l', 'l.id', 's.level_id')
    .join('programs as p', 'p.id', 'l.program_id')
    .whereIn(
      'ta.teacher_id',
      rows.map((r) => r.id),
    )
    .distinct('ta.teacher_id', 'p.name');

  return {
    items: rows.map((r) => ({
      id: r.id,
      lastName: r.last_name,
      firstNames: r.first_names,
      programs: programs.filter((p) => p.teacher_id === r.id).map((p) => p.name),
    })),
  };
}

// ------------------------------------------------------------------ création

/**
 * Crée le compte d'un étudiant et l'inscrit dans une année (RG-01, RG-02, RG-11).
 *
 * @param {object} actor
 * @param {{lastName: string, firstNames: string, email: string, phone?: string, levelId: string}} input
 * @param {import('knex').Knex} [conn=db]
 * @returns {Promise<{user: object, temporaryPassword: string}>}
 * @throws {HttpError} 404 année, 403 hors filière, 409 EMAIL_ALREADY_USED.
 */
export async function createStudent(actor, input, conn = db) {
  assertRole(actor, ...ADMIN_ROLES);
  assertManagesProgram(actor, await programOfLevel(input.levelId, conn));

  return conn.transaction(async (trx) => {
    const { row, temporaryPassword } = await insertUser({ ...input, role: 'student' }, trx);
    await trx('enrollments').insert({ student_id: row.id, level_id: input.levelId });
    return { user: toUser(row), temporaryPassword };
  });
}

/**
 * Crée un professeur, ou lie un professeur existant à de nouveaux modules (RG-03, RG-04).
 * Chaque module doit appartenir à une filière administrée par l'utilisateur.
 *
 * @param {object} actor
 * @param {object} input - Nouveau professeur (nom, prénoms, e-mail, modules) ou
 *   { existingTeacherId, moduleIds }.
 * @param {import('knex').Knex} [conn=db]
 * @returns {Promise<{user: object, linked: boolean, assignments: Array<object>, temporaryPassword: string|null}>}
 */
export async function createTeacher(actor, input, conn = db) {
  assertRole(actor, ...ADMIN_ROLES);
  const modules = await modulesWithProgram(input.moduleIds, conn);
  for (const m of modules) assertManagesProgram(actor, m.program_id);

  return conn.transaction(async (trx) => {
    if (input.existingTeacherId) {
      const teacher = await getUser(input.existingTeacherId, trx);
      if (teacher.role !== 'teacher') throw notFound('Professeur introuvable.');
      const assignments = await insertAssignments(teacher.id, modules, trx);
      return { user: toUser(teacher), linked: true, assignments, temporaryPassword: null };
    }
    const { row, temporaryPassword } = await insertUser({ ...input, role: 'teacher' }, trx);
    const assignments = await insertAssignments(row.id, modules, trx);
    return { user: toUser(row), linked: false, assignments, temporaryPassword };
  });
}

/**
 * Affecte un professeur à un module supplémentaire (RG-03, RG-12).
 * @returns {Promise<object>} L'affectation créée.
 */
export async function addAssignment(actor, teacherId, moduleId, conn = db) {
  assertRole(actor, ...ADMIN_ROLES);
  const teacher = await getUser(teacherId, conn);
  if (teacher.role !== 'teacher') throw notFound('Professeur introuvable.');
  const [module] = await modulesWithProgram([moduleId], conn);
  assertManagesProgram(actor, module.program_id);
  const [assignment] = await insertAssignments(teacherId, [module], conn);
  return assignment;
}

/**
 * Retire une affectation. Refusé si des séances futures (non annulées) utilisent encore ce
 * professeur sur ce module : il faut d'abord les confier à quelqu'un d'autre.
 * @throws {HttpError} 404, 403, 409 ASSIGNMENT_IN_USE.
 */
export async function removeAssignment(actor, teacherId, assignmentId, conn = db) {
  assertRole(actor, ...ADMIN_ROLES);
  const assignment = await conn('teacher_assignments')
    .where({ id: assignmentId, teacher_id: teacherId })
    .first();
  if (!assignment) throw notFound('Affectation introuvable.');
  const [module] = await modulesWithProgram([assignment.module_id], conn);
  assertManagesProgram(actor, module.program_id);

  const future = await conn('sessions')
    .where({ teacher_id: teacherId, module_id: assignment.module_id })
    .whereNot('status', 'cancelled')
    .where('starts_at', '>', conn.fn.now())
    .first('id');
  if (future) {
    throw new HttpError(
      409,
      'ASSIGNMENT_IN_USE',
      'Des séances à venir utilisent encore ce professeur sur ce module.',
    );
  }
  await conn('teacher_assignments').where({ id: assignmentId }).del();
}

/**
 * Crée un compte d'administration de filière : RP (directeurs seulement) ou adjoint
 * (directeur ou RP de la filière ; un adjoint ne nomme pas d'adjoint) (RG-05).
 * Renvoie aussi le code administrateur, affiché une seule fois (RG-07).
 *
 * @param {object} actor
 * @param {'programHead'|'assistant'} role
 * @param {{lastName: string, firstNames: string, email: string, phone?: string, programId: string}} input
 * @param {import('knex').Knex} [conn=db]
 * @returns {Promise<{user: object, temporaryPassword: string, adminCode: string}>}
 */
export async function createManager(actor, role, input, conn = db) {
  if (role === 'programHead') {
    assertRole(actor, 'director');
  } else {
    assertRole(actor, 'director', 'programHead');
    assertManagesProgram(actor, input.programId);
  }
  const program = await conn('programs').where({ id: input.programId }).first();
  if (!program) throw notFound('Filière introuvable.');

  const adminCode = generateAdminCode(role === 'programHead' ? 'RP' : 'AD');
  const { row, temporaryPassword } = await insertUser({ ...input, role, adminCode }, conn);
  return { user: toUser(row), temporaryPassword, adminCode };
}

// ------------------------------------------------------------------ modification

/**
 * Nomme un super étudiant ou lui retire ce droit (RG-31, user story R9).
 * Réservé à l'administration de la filière où l'étudiant est inscrit.
 */
export async function setSuperStudent(actor, studentId, isSuperStudent, conn = db) {
  assertRole(actor, ...ADMIN_ROLES);
  const student = await getUser(studentId, conn);
  if (student.role !== 'student') throw notFound('Étudiant introuvable.');
  const programs = await programsOfUser(student, conn);
  if (!programs.some((p) => managesProgram(actor, p))) throw forbidden();

  const [row] = await conn('users')
    .where({ id: studentId })
    .update({ is_super_student: isSuperStudent })
    .returning('*');
  return { user: toUser(row) };
}

/**
 * Génère un nouveau mot de passe temporaire (user story R12). La personne devra le changer
 * à sa prochaine connexion.
 * Directeur : tout compte. RP et adjoint : étudiants, professeurs et adjoints de leur filière
 * (pas un RP ni un directeur).
 */
export async function resetPassword(actor, userId, conn = db) {
  assertRole(actor, ...ADMIN_ROLES);
  const user = await getUser(userId, conn);
  if (actor.role !== 'director') {
    if (!['student', 'teacher', 'assistant'].includes(user.role)) throw forbidden();
    const programs = await programsOfUser(user, conn);
    if (!programs.some((p) => managesProgram(actor, p))) throw forbidden();
  }

  const temporaryPassword = generateTemporaryPassword();
  await conn('users')
    .where({ id: userId })
    .update({ password_hash: await hashPassword(temporaryPassword), must_change_password: true });
  return { temporaryPassword };
}
