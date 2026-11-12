/**
 * @file Schémas Zod des routes de structure académique (docs/api.md, § 5).
 * Règles de gestion : RG-09, RG-26, RG-29.
 */
import { z } from './zod.js';

const name = z.string().trim().min(1).max(120);

export const createProgramBody = z.object({
  name,
  durationYears: z.number().int().min(1).max(8),
});

export const createLevelBody = z.object({
  number: z.number().int().min(1).max(8),
  cohort: z.string().trim().min(1).max(20),
});

/** RG-26 et RG-29 : un semestre en cours, 1 ou 2. */
export const currentSemesterBody = z.object({
  semesterNumber: z.union([z.literal(1), z.literal(2)]),
});

/** Volume horaire en heures, demi-heures acceptées (séance de 1 h 30). */
const totalHours = z.number().positive().max(999).multipleOf(0.5);

export const createModuleBody = z.object({ name, totalHours });

export const updateModuleBody = z
  .object({ name: name.optional(), totalHours: totalHours.optional() })
  .refine((body) => body.name !== undefined || body.totalHours !== undefined, {
    message: 'Indique au moins un champ à modifier : name ou totalHours.',
  });
