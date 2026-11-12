/**
 * @file Service de la structure académique : filières, années, semestres, modules.
 * Règles de gestion : RG-08, RG-09, RG-10, RG-26, RG-29, RG-30 (canaux créés avec la
 * filière ou l'année).
 *
 * Chaque fonction reçoit l'utilisateur connecté (`actor`, voir middlewares/require-user.js)
 * et, en dernier paramètre, la connexion à utiliser : la base par défaut, ou une
 * transaction dans les tests.
 */
import { db } from '../db/knex.js';
import { HttpError } from '../utils/http-error.js';
import { assertManagesProgram, assertRole, forbidden, managesProgram, notFound } from './access.js';

// ------------------------------------------------------------------ conversions
// La base parle en snake_case, l'API en camelCase (docs/api.md, § 0.1).

const toProgram = (r) => ({ id: r.id, name: r.name, durationYears: r.duration_years });
const toLevel = (r) => ({ id: r.id, programId: r.program_id, number: r.number, cohort: r.cohort });
const toSemester = (r) => ({ id: r.id, number: r.number, active: r.is_active });
const toModule = (r) => ({
  id: r.id,
  semesterId: r.semester_id,
  name: r.name,
  totalHours: Number(r.total_hours), // numeric arrive en texte depuis PostgreSQL
});

/** Code PostgreSQL d'une violation de contrainte UNIQUE. */
const UNIQUE_VIOLATION = '23505';

// ------------------------------------------------------------------ contexte d'une ressource

/** Retrouve une année et sa filière, ou lance une erreur 404. */
async function getLevelContext(levelId, conn) {
  const level = await conn('levels').where({ id: levelId }).first();
  if (!level) throw notFound('Année introuvable.');
  return level;
}

/** Retrouve un semestre avec son année et sa filière, ou lance une erreur 404. */
async function getSemesterContext(semesterId, conn) {
  const row = await conn('semesters as s')
    .join('levels as l', 'l.id', 's.level_id')
    .where('s.id', semesterId)
    .first('s.id', 's.level_id', 'l.program_id');
  if (!row) throw notFound('Semestre introuvable.');
  return row;
}

/** Retrouve un module avec son semestre, son année et sa filière, ou lance une erreur 404. */
async function getModuleContext(moduleId, conn) {
  const row = await conn('modules as m')
    .join('semesters as s', 's.id', 'm.semester_id')
    .join('levels as l', 'l.id', 's.level_id')
    .where('m.id', moduleId)
    .first('m.*', 's.level_id', 'l.program_id');
  if (!row) throw notFound('Module introuvable.');
  return row;
}

/** Le professeur est-il affecté à ce module ? */
async function isAssignedTeacher(actor, moduleId, conn) {
  if (actor.role !== 'teacher') return false;
  const row = await conn('teacher_assignments')
    .where({ teacher_id: actor.id, module_id: moduleId })
    .first('id');
  return Boolean(row);
}

/**
 * Années visibles par un professeur ou un étudiant. `null` = pas de restriction par année
 * (directeur, RP, adjoint : leur filière entière).
 */
async function visibleLevelIds(actor, conn) {
  if (actor.role === 'teacher') {
    const rows = await conn('teacher_assignments as ta')
      .join('modules as m', 'm.id', 'ta.module_id')
      .join('semesters as s', 's.id', 'm.semester_id')
      .where('ta.teacher_id', actor.id)
      .distinct('s.level_id');
    return rows.map((r) => r.level_id);
  }
  if (actor.role === 'student') {
    const rows = await conn('enrollments').where({ student_id: actor.id }).select('level_id');
    return rows.map((r) => r.level_id);
  }
  return null;
}

// ------------------------------------------------------------------ filières

/**
 * Liste les filières et leurs années, filtrées par périmètre.
 * Directeur : tout. RP et adjoint : leur filière. Professeur : les années de ses
 * affectations. Étudiant : les années où il est ou a été inscrit.
 *
 * @param {object} actor - Utilisateur connecté.
 * @param {import('knex').Knex} [conn=db]
 * @returns {Promise<{items: Array<object>}>}
 */
export async function listPrograms(actor, conn = db) {
  const levelIds = await visibleLevelIds(actor, conn);

  const levelsQuery = conn('levels as l')
    .leftJoin('semesters as s', function joinActive() {
      this.on('s.level_id', 'l.id').andOn('s.is_active', conn.raw('true'));
    })
    .select('l.*', 's.number as current_semester_number')
    .orderBy([{ column: 'l.number' }, { column: 'l.cohort', order: 'desc' }]);

  if (levelIds !== null) {
    levelsQuery.whereIn('l.id', levelIds);
  } else if (actor.role !== 'director') {
    levelsQuery.where('l.program_id', actor.programId);
  }
  const levels = await levelsQuery;

  const programsQuery = conn('programs').orderBy('name');
  if (levelIds !== null) {
    programsQuery.whereIn('id', [...new Set(levels.map((l) => l.program_id))]);
  } else if (actor.role !== 'director') {
    programsQuery.where('id', actor.programId);
  }
  const programs = await programsQuery;

  return {
    items: programs.map((p) => ({
      ...toProgram(p),
      levels: levels
        .filter((l) => l.program_id === p.id)
        .map((l) => ({ ...toLevel(l), currentSemesterNumber: l.current_semester_number ?? null })),
    })),
  };
}

/**
 * Crée une filière et son canal d'information (RG-09, RG-30). Réservé aux directeurs.
 *
 * @param {object} actor
 * @param {{name: string, durationYears: number}} input - Corps validé par Zod.
 * @param {import('knex').Knex} [conn=db]
 * @returns {Promise<{program: object, channelId: string}>}
 * @throws {HttpError} 403 si l'utilisateur n'est pas directeur, 409 PROGRAM_NAME_TAKEN.
 */
export async function createProgram(actor, input, conn = db) {
  assertRole(actor, 'director');
  try {
    return await conn.transaction(async (trx) => {
      const [program] = await trx('programs')
        .insert({ name: input.name, duration_years: input.durationYears })
        .returning('*');
      const [channel] = await trx('channels')
        .insert({ scope: 'program', program_id: program.id })
        .returning('id');
      return { program: toProgram(program), channelId: channel.id };
    });
  } catch (err) {
    if (err.code === UNIQUE_VIOLATION) {
      throw new HttpError(409, 'PROGRAM_NAME_TAKEN', 'Une filière porte déjà ce nom.');
    }
    throw err;
  }
}

// ------------------------------------------------------------------ années et semestres

/**
 * Crée une année d'une filière pour une cohorte, ses deux semestres (le premier en cours)
 * et son sous-canal d'information. Ajouter une cohorte = ajouter des lignes (RG-09).
 *
 * @param {object} actor
 * @param {string} programId
 * @param {{number: number, cohort: string}} input
 * @param {import('knex').Knex} [conn=db]
 * @returns {Promise<{level: object, semesters: Array<object>, channelId: string}>}
 * @throws {HttpError} 404, 403, 400 (numéro supérieur à la durée), 409 LEVEL_ALREADY_EXISTS.
 */
export async function createLevel(actor, programId, input, conn = db) {
  const program = await conn('programs').where({ id: programId }).first();
  if (!program) throw notFound('Filière introuvable.');
  assertManagesProgram(actor, programId);

  if (input.number > program.duration_years) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Données invalides.', [
      {
        field: 'number',
        message: `Cette filière dure ${program.duration_years} an(s) : l'année ${input.number} n'existe pas.`,
      },
    ]);
  }

  try {
    return await conn.transaction(async (trx) => {
      const [level] = await trx('levels')
        .insert({ program_id: programId, number: input.number, cohort: input.cohort })
        .returning('*');
      const semesters = await trx('semesters')
        .insert([
          { level_id: level.id, number: 1, is_active: true },
          { level_id: level.id, number: 2, is_active: false },
        ])
        .returning('*');
      const [channel] = await trx('channels')
        .insert({ scope: 'level', level_id: level.id })
        .returning('id');
      return {
        level: toLevel(level),
        semesters: semesters.sort((a, b) => a.number - b.number).map(toSemester),
        channelId: channel.id,
      };
    });
  } catch (err) {
    if (err.code === UNIQUE_VIOLATION) {
      throw new HttpError(
        409,
        'LEVEL_ALREADY_EXISTS',
        'Cette année existe déjà pour cette cohorte.',
      );
    }
    throw err;
  }
}

/**
 * Détail d'une année : semestres, modules et professeurs affectés.
 * Visible par le directeur, le RP et l'adjoint de la filière, un professeur affecté à un
 * module de l'année, un étudiant inscrit dans l'année.
 *
 * @param {object} actor
 * @param {string} levelId
 * @param {import('knex').Knex} [conn=db]
 * @returns {Promise<{level: object, semesters: Array<object>}>}
 */
export async function getLevel(actor, levelId, conn = db) {
  const level = await getLevelContext(levelId, conn);
  if (!managesProgram(actor, level.program_id)) {
    const levelIds = await visibleLevelIds(actor, conn);
    if (!levelIds || !levelIds.includes(levelId)) throw forbidden();
  }

  const program = await conn('programs').where({ id: level.program_id }).first('name');
  const semesters = await conn('semesters').where({ level_id: levelId }).orderBy('number');
  const modules = await conn('modules')
    .whereIn(
      'semester_id',
      semesters.map((s) => s.id),
    )
    .orderBy('name');
  const teachers = await conn('teacher_assignments as ta')
    .join('users as u', 'u.id', 'ta.teacher_id')
    .whereIn(
      'ta.module_id',
      modules.map((m) => m.id),
    )
    .select('ta.module_id', 'u.id', 'u.last_name', 'u.first_names');

  return {
    level: { ...toLevel(level), programName: program.name },
    semesters: semesters.map((s) => ({
      ...toSemester(s),
      modules: modules
        .filter((m) => m.semester_id === s.id)
        .map((m) => ({
          ...toModule(m),
          teachers: teachers
            .filter((t) => t.module_id === m.id)
            .map((t) => ({ id: t.id, name: `${t.last_name} ${t.first_names}` })),
        })),
    })),
  };
}

/**
 * Indique le semestre en cours d'une année, ou passe au second semestre (RG-26, RG-29).
 * Un seul semestre actif à la fois : on éteint d'abord les deux, puis on allume le bon,
 * dans une transaction (l'index unique partiel refuserait deux semestres actifs).
 *
 * @param {object} actor
 * @param {string} levelId
 * @param {1|2} semesterNumber
 * @param {import('knex').Knex} [conn=db]
 * @returns {Promise<{levelId: string, currentSemesterNumber: number}>}
 */
export async function setCurrentSemester(actor, levelId, semesterNumber, conn = db) {
  const level = await getLevelContext(levelId, conn);
  assertManagesProgram(actor, level.program_id);

  await conn.transaction(async (trx) => {
    await trx('semesters').where({ level_id: levelId }).update({ is_active: false });
    await trx('semesters')
      .where({ level_id: levelId, number: semesterNumber })
      .update({ is_active: true });
  });
  return { levelId, currentSemesterNumber: semesterNumber };
}

// ------------------------------------------------------------------ modules

/**
 * Ajoute un module à un semestre avec son volume horaire (RG-26).
 *
 * @param {object} actor
 * @param {string} semesterId
 * @param {{name: string, totalHours: number}} input
 * @param {import('knex').Knex} [conn=db]
 * @returns {Promise<{module: object}>}
 * @throws {HttpError} 404, 403, 409 MODULE_NAME_TAKEN.
 */
export async function createModule(actor, semesterId, input, conn = db) {
  const semester = await getSemesterContext(semesterId, conn);
  assertManagesProgram(actor, semester.program_id);
  try {
    const [module] = await conn('modules')
      .insert({ semester_id: semesterId, name: input.name, total_hours: input.totalHours })
      .returning('*');
    return { module: toModule(module) };
  } catch (err) {
    if (err.code === UNIQUE_VIOLATION) {
      throw new HttpError(
        409,
        'MODULE_NAME_TAKEN',
        'Un module porte déjà ce nom dans ce semestre.',
      );
    }
    throw err;
  }
}

/**
 * Heures déjà confirmées d'un module : somme des durées des séances confirmées (RG-28).
 * Le calcul est fait par PostgreSQL (règle technique n° 8).
 */
async function confirmedHours(moduleId, conn) {
  const row = await conn('sessions')
    .where({ module_id: moduleId, status: 'confirmed' })
    .first(conn.raw('coalesce(sum(extract(epoch from ends_at - starts_at)) / 3600, 0) as hours'));
  return Number(row.hours);
}

/**
 * Modifie le nom ou le volume horaire d'un module.
 * Le volume ne peut pas descendre sous les heures déjà confirmées.
 *
 * @param {object} actor
 * @param {string} moduleId
 * @param {{name?: string, totalHours?: number}} changes
 * @param {import('knex').Knex} [conn=db]
 * @returns {Promise<{module: object}>}
 */
export async function updateModule(actor, moduleId, changes, conn = db) {
  const current = await getModuleContext(moduleId, conn);
  assertManagesProgram(actor, current.program_id);

  if (changes.totalHours !== undefined) {
    const done = await confirmedHours(moduleId, conn);
    if (changes.totalHours < done) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Données invalides.', [
        {
          field: 'totalHours',
          message: `${done} h sont déjà confirmées : le volume ne peut pas être inférieur.`,
        },
      ]);
    }
  }

  const update = {};
  if (changes.name !== undefined) update.name = changes.name;
  if (changes.totalHours !== undefined) update.total_hours = changes.totalHours;

  try {
    const [module] = await conn('modules').where({ id: moduleId }).update(update).returning('*');
    return { module: toModule(module) };
  } catch (err) {
    if (err.code === UNIQUE_VIOLATION) {
      throw new HttpError(
        409,
        'MODULE_NAME_TAKEN',
        'Un module porte déjà ce nom dans ce semestre.',
      );
    }
    throw err;
  }
}

/**
 * Supprime un module créé par erreur. Refusé dès que le module a des séances ou des notes :
 * on ne supprime jamais l'historique. Ses affectations de professeurs partent avec lui.
 *
 * @param {object} actor
 * @param {string} moduleId
 * @param {import('knex').Knex} [conn=db]
 * @throws {HttpError} 404, 403, 409 MODULE_IN_USE.
 */
export async function deleteModule(actor, moduleId, conn = db) {
  const module = await getModuleContext(moduleId, conn);
  assertManagesProgram(actor, module.program_id);

  const session = await conn('sessions').where({ module_id: moduleId }).first('id');
  const grade = await conn('grades').where({ module_id: moduleId }).first('id');
  if (session || grade) {
    throw new HttpError(
      409,
      'MODULE_IN_USE',
      'Ce module a déjà des séances ou des notes : il ne peut pas être supprimé.',
    );
  }

  await conn.transaction(async (trx) => {
    await trx('teacher_assignments').where({ module_id: moduleId }).del();
    await trx('modules').where({ id: moduleId }).del();
  });
}

/**
 * Étudiants qui suivent un module, c'est-à-dire inscrits dans l'année du module.
 * Visible par l'administration de la filière et par les professeurs affectés au module.
 * Seuls le nom et les prénoms sont renvoyés (pas d'e-mail ni de téléphone).
 *
 * @param {object} actor
 * @param {string} moduleId
 * @param {{page: number, pageSize: number}} paging
 * @param {import('knex').Knex} [conn=db]
 * @returns {Promise<{items: Array<object>, page: number, pageSize: number, total: number}>}
 */
export async function listModuleStudents(actor, moduleId, paging, conn = db) {
  const module = await getModuleContext(moduleId, conn);
  const allowed =
    managesProgram(actor, module.program_id) || (await isAssignedTeacher(actor, moduleId, conn));
  if (!allowed) throw forbidden();

  const base = conn('enrollments as e')
    .join('users as u', 'u.id', 'e.student_id')
    .where('e.level_id', module.level_id);

  const [{ total }] = await base.clone().count({ total: '*' });
  const rows = await base
    .clone()
    .select('u.id', 'u.last_name', 'u.first_names')
    .orderBy([{ column: 'u.last_name' }, { column: 'u.first_names' }])
    .limit(paging.pageSize)
    .offset((paging.page - 1) * paging.pageSize);

  return {
    items: rows.map((r) => ({ id: r.id, lastName: r.last_name, firstNames: r.first_names })),
    page: paging.page,
    pageSize: paging.pageSize,
    total: Number(total),
  };
}
