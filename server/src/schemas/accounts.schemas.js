/**
 * @file Schémas Zod des routes de comptes (docs/api.md, § 4).
 * Règles de gestion : RG-02 à RG-05.
 */
import { z } from './zod.js';
import { pagination, uuid } from './common.schemas.js';

const personName = z.string().trim().min(1).max(100);
/** E-mail rangé en minuscules : un même e-mail ne sert qu'à un seul compte. */
const email = z
  .email()
  .max(200)
  .transform((value) => value.trim().toLowerCase());
/** Numéro fourni par la personne (téléphone, point 1 à confirmer dans le contrat d'API). */
const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ]{6,20}$/, 'Numéro invalide : chiffres et espaces, « + » au début.')
  .optional();

const person = { lastName: personName, firstNames: personName, email, phone };

export const listAccountsQuery = pagination.extend({
  role: z.enum(['director', 'programHead', 'assistant', 'teacher', 'student']).optional(),
  programId: uuid.optional(),
  levelId: uuid.optional(),
  search: z.string().trim().min(1).max(100).optional(),
});

export const createStudentBody = z.object({ ...person, levelId: uuid });

export const searchTeachersQuery = z.object({
  lastName: z.string().trim().min(2).max(100),
  firstNames: z.string().trim().max(100).optional(),
});

/** RG-03 et RG-04 : nouveau professeur, ou professeur existant à lier à de nouveaux modules. */
export const createTeacherBody = z.union([
  z.object({ ...person, moduleIds: z.array(uuid).min(1).max(20) }),
  z.object({ existingTeacherId: uuid, moduleIds: z.array(uuid).min(1).max(20) }),
]);

export const assignmentBody = z.object({ moduleId: uuid });

export const createManagerBody = z.object({ ...person, programId: uuid });

export const superStudentBody = z.object({ isSuperStudent: z.boolean() });
