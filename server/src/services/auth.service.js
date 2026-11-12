/**
 * @file Service d'authentification : connexion, changement de mot de passe, profil courant.
 * Règles de gestion : RG-01, RG-06, RG-07 (en partie, voir TODO), RG-08.
 */
import { db } from '../db/knex.js';
import { HttpError } from '../utils/http-error.js';
import { DUMMY_HASH, hashPassword, passwordProblems, verifyPassword } from './password.service.js';

/** Utilisateur au format de l'API (docs/api.md, § 0.7). Jamais le hachage du mot de passe. */
export function toUser(row) {
  return {
    id: row.id,
    lastName: row.last_name,
    firstNames: row.first_names,
    email: row.email,
    phone: row.phone,
    role: row.role,
    programId: row.program_id,
    isSuperStudent: row.is_super_student,
    mustChangePassword: row.must_change_password,
  };
}

/** Message unique : on ne dit jamais si c'est l'e-mail ou le mot de passe qui est faux. */
const invalidCredentials = () =>
  new HttpError(401, 'INVALID_CREDENTIALS', 'E-mail ou mot de passe incorrect.');

/**
 * Vérifie l'e-mail et le mot de passe.
 * TODO(C-6) : pour les directeurs, RP et adjoints, demander aussi le code administrateur
 * et un code envoyé par e-mail (RG-07) avant de donner la session.
 *
 * @param {{email: string, password: string}} input - Corps validé par Zod.
 * @param {import('knex').Knex} [conn=db]
 * @returns {Promise<object>} La ligne users de la personne connectée.
 * @throws {HttpError} 401 INVALID_CREDENTIALS.
 */
export async function login(input, conn = db) {
  const user = await conn('users')
    .whereRaw('lower(email) = lower(?)', [input.email])
    .andWhere({ is_active: true })
    .first();

  // On compare toujours un hachage, même si le compte n'existe pas : même durée de réponse.
  const ok = await verifyPassword(input.password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) throw invalidCredentials();
  return user;
}

/**
 * Change le mot de passe de l'utilisateur connecté (obligatoire à la première connexion,
 * RG-06). L'ancien mot de passe est redemandé.
 *
 * @param {object} actor - req.user.
 * @param {{currentPassword: string, newPassword: string}} input
 * @param {import('knex').Knex} [conn=db]
 * @returns {Promise<object>} L'utilisateur mis à jour.
 * @throws {HttpError} 401 si l'ancien mot de passe est faux, 400 si le nouveau est faible.
 */
export async function changePassword(actor, input, conn = db) {
  const user = await conn('users').where({ id: actor.id }).first();
  if (!(await verifyPassword(input.currentPassword, user.password_hash))) {
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Le mot de passe actuel est incorrect.');
  }

  const problems = passwordProblems(input.newPassword);
  if (input.newPassword === input.currentPassword) {
    problems.push("Le nouveau mot de passe doit être différent de l'ancien.");
  }
  if (problems.length) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Mot de passe trop faible.',
      problems.map((message) => ({ field: 'newPassword', message })),
    );
  }

  const [updated] = await conn('users')
    .where({ id: actor.id })
    .update({ password_hash: await hashPassword(input.newPassword), must_change_password: false })
    .returning('*');
  return toUser(updated);
}

/**
 * Profil et périmètre de l'utilisateur connecté, pour la navigation par rôle du front (B-2).
 *
 * @param {object} actor - req.user.
 * @param {import('knex').Knex} [conn=db]
 * @returns {Promise<{user: object, scope: object}>}
 */
export async function getMe(actor, conn = db) {
  const user = await conn('users').where({ id: actor.id }).first();
  const scope = {
    programId: user.program_id,
    levelId: null,
    assignments: [],
    canCorrectGrades: user.role === 'director',
    delegationEndsAt: null,
  };

  if (user.role === 'student') {
    const enrollment = await conn('enrollments as e')
      .join('levels as l', 'l.id', 'e.level_id')
      .where({ 'e.student_id': user.id, 'e.status': 'ongoing' })
      .first('e.level_id', 'l.program_id');
    scope.levelId = enrollment?.level_id ?? null;
    scope.programId = enrollment?.program_id ?? null;
  }

  if (user.role === 'teacher') {
    const rows = await conn('teacher_assignments as ta')
      .join('modules as m', 'm.id', 'ta.module_id')
      .join('semesters as s', 's.id', 'm.semester_id')
      .join('levels as l', 'l.id', 's.level_id')
      .where('ta.teacher_id', user.id)
      .orderBy('m.name')
      .select('ta.id', 'm.id as module_id', 'm.name', 'l.program_id', 'l.id as level_id');
    scope.assignments = rows.map((r) => ({
      id: r.id,
      moduleId: r.module_id,
      moduleName: r.name,
      programId: r.program_id,
      levelId: r.level_id,
    }));
  }

  if (user.role === 'programHead') {
    // RG-22 : délégation active = commencée, ni terminée ni retirée (heure du serveur).
    const delegation = await conn('grade_delegations')
      .where('program_head_id', user.id)
      .whereNull('revoked_at')
      .where('starts_at', '<=', conn.fn.now())
      .where((q) => q.whereNull('ends_at').orWhere('ends_at', '>', conn.fn.now()))
      .orderBy('ends_at', 'desc')
      .first();
    if (delegation) {
      scope.canCorrectGrades = true;
      scope.delegationEndsAt = delegation.ends_at;
    }
  }

  return { user: toUser(user), scope };
}
