/**
 * @file Authentification de chaque requête (tâches C-4 et C-5, règle RG-08).
 *
 * 1. Lit le cookie de session et vérifie le jeton (signature et expiration).
 * 2. Relit l'utilisateur en base : un compte désactivé ou supprimé est refusé tout de suite.
 * 3. Remplit req.user = { id, role, programId, isSuperStudent, mustChangePassword }.
 * 4. Renouvelle le jeton s'il a dépassé la moitié de sa durée : l'utilisateur reste connecté
 *    tant qu'il est actif, et il est déconnecté après 30 min sans activité.
 *
 * Le périmètre sur une ressource (filière, module) est vérifié ensuite par les services.
 */
import { db } from '../db/knex.js';
import { HttpError } from '../utils/http-error.js';
import {
  RENEW_AFTER_SECONDS,
  readSessionCookie,
  setSessionCookie,
  verifyToken,
} from '../services/token.service.js';

/** Construit req.user à partir d'une ligne de la table users. */
export function toActor(row) {
  return {
    id: row.id,
    role: row.role,
    programId: row.program_id,
    isSuperStudent: row.is_super_student,
    mustChangePassword: row.must_change_password,
  };
}

/** @type {import('express').RequestHandler} */
export async function authenticate(req, res, next) {
  const payload = verifyToken(readSessionCookie(req));
  if (!payload) {
    throw new HttpError(401, 'UNAUTHENTICATED', 'Ta session a expiré. Reconnecte-toi.');
  }

  const user = await db('users').where({ id: payload.sub, is_active: true }).first();
  if (!user) {
    throw new HttpError(401, 'UNAUTHENTICATED', 'Ta session a expiré. Reconnecte-toi.');
  }

  req.user = toActor(user);

  const ageSeconds = Math.floor(Date.now() / 1000) - payload.iat;
  if (ageSeconds > RENEW_AFTER_SECONDS) {
    setSessionCookie(res, user.id);
  }
  next();
}

/**
 * Bloque les routes métier tant que le mot de passe temporaire n'a pas été changé (RG-06).
 * Seules /api/auth/me, /change-password et /logout restent ouvertes dans ce cas.
 * @type {import('express').RequestHandler}
 */
export function requirePasswordChanged(req, res, next) {
  if (req.user?.mustChangePassword) {
    throw new HttpError(
      403,
      'PASSWORD_CHANGE_REQUIRED',
      'Change ton mot de passe temporaire avant de continuer.',
    );
  }
  next();
}
