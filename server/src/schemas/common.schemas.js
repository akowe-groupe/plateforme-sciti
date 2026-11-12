/**
 * @file Schémas Zod réutilisés par plusieurs domaines : identifiants et pagination.
 */
import { z } from './zod.js';

/** Identifiant UUID dans l'URL, par exemple `:levelId`. */
export const uuid = z.uuid();

/**
 * Paramètres d'URL composés d'identifiants UUID.
 * @param {...string} names - Noms des paramètres, par exemple 'levelId'.
 */
export function uuidParams(...names) {
  return z.object(Object.fromEntries(names.map((name) => [name, uuid])));
}

/** Pagination des listes (docs/api.md, § 0.4) : 20 éléments par défaut, 100 au maximum. */
export const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
