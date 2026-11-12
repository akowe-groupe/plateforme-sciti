/**
 * @file Contrôle du périmètre d'un utilisateur (règles RG-08 et RG-10).
 *
 * Le middleware de C vérifie le jeton et le rôle. Les services, eux, vérifient le périmètre
 * sur la ressource demandée : « ce module appartient-il à la filière de ce RP ? ».
 * Cette vérification a besoin de la base, c'est pourquoi elle vit ici.
 */
import { HttpError } from '../utils/http-error.js';

/** Rôles de l'administration d'une filière (RP et adjoint ont les mêmes droits, RG-05). */
const PROGRAM_MANAGERS = ['programHead', 'assistant'];

/** Erreur 403 standard (docs/api.md, § 0.5). */
export function forbidden(message = "Tu n'as pas le droit de faire cette action.") {
  return new HttpError(403, 'FORBIDDEN', message);
}

/** Erreur 404 standard. */
export function notFound(message = 'Ressource introuvable.') {
  return new HttpError(404, 'NOT_FOUND', message);
}

/**
 * Indique si l'utilisateur administre la filière : un directeur (toutes les filières, D5),
 * ou un RP ou un adjoint de cette filière (RG-10).
 * @param {{role: string, programId: string|null}} actor
 * @param {string} programId
 * @returns {boolean}
 */
export function managesProgram(actor, programId) {
  if (actor.role === 'director') return true;
  return PROGRAM_MANAGERS.includes(actor.role) && actor.programId === programId;
}

/**
 * Lance une erreur 403 si l'utilisateur n'administre pas la filière.
 * @param {{role: string, programId: string|null}} actor
 * @param {string} programId
 */
export function assertManagesProgram(actor, programId) {
  if (!managesProgram(actor, programId)) {
    throw forbidden('Cette filière ne fait pas partie de ton périmètre.');
  }
}

/**
 * Lance une erreur 403 si l'utilisateur n'a pas l'un des rôles donnés.
 * @param {{role: string}} actor
 * @param {...string} roles
 */
export function assertRole(actor, ...roles) {
  if (!roles.includes(actor.role)) {
    throw forbidden();
  }
}
