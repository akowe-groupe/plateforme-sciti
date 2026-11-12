/**
 * @file Schémas Zod des routes d'authentification (docs/api.md, § 2).
 */
import { z } from './zod.js';

export const loginBody = z.object({
  email: z.email().max(200),
  password: z.string().min(1).max(200),
  // Prévu pour C-6 (RG-07) : accepté mais pas encore vérifié.
  adminCode: z.string().max(50).optional(),
});

export const changePasswordBody = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(1).max(200),
});
