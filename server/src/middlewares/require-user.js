/**
 * @file Refuse toute requête sans utilisateur connecté (règle RG-08).
 *
 * Le middleware d'authentification de C (tâches C-4 et C-5) vérifie le jeton JWT et remplit
 * `req.user` avec la forme suivante, utilisée par tous les services :
 *   { id: string, role: 'director'|'programHead'|'assistant'|'teacher'|'student',
 *     programId: string|null, isSuperStudent: boolean }
 * Ce middleware-ci ne lit aucun jeton : il garantit seulement qu'aucune route métier ne
 * s'exécute si `req.user` est absent, même si le middleware de C est oublié sur une route.
 */
import { HttpError } from '../utils/http-error.js';

/** @type {import('express').RequestHandler} */
export function requireUser(req, res, next) {
  if (!req.user) {
    throw new HttpError(401, 'UNAUTHENTICATED', 'Connecte-toi pour continuer.');
  }
  next();
}
