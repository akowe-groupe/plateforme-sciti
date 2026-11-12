/**
 * @file Lecture et validation des variables d'environnement.
 * Règle technique n° 12 du guide : les secrets viennent uniquement de l'environnement.
 * Si une variable obligatoire manque, le serveur refuse de démarrer avec un message clair,
 * au lieu de planter plus tard au milieu d'une requête.
 */
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().startsWith('postgres', 'DATABASE_URL doit être une URL PostgreSQL.'),
  // Secret de signature des jetons : long et aléatoire, jamais dans le dépôt.
  JWT_SECRET: z.string().min(32, 'JWT_SECRET doit faire au moins 32 caractères.'),
  // Durée d'inactivité avant déconnexion (le jeton est renouvelé pendant l'activité).
  JWT_EXPIRES_IN: z
    .string()
    .regex(/^\d+[mh]$/, 'Exemple attendu : 30m ou 2h.')
    .default('30m'),
  // Tentatives de connexion autorisées par adresse IP et par quart d'heure.
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(10),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const problems = parsed.error.issues.map(
    (issue) => `- ${issue.path.join('.')} : ${issue.message}`,
  );
  console.error(`Configuration invalide. Vérifie ton fichier .env :\n${problems.join('\n')}`);
  process.exit(1);
}

/** Configuration validée, à importer partout au lieu de lire process.env directement. */
export const env = parsed.data;
