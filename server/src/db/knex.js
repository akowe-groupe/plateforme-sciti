/**
 * @file Connexion unique à PostgreSQL, partagée par tous les services.
 * Knex construit des requêtes paramétrées : les valeurs ne sont jamais collées dans le
 * texte SQL (règle technique n° 4 du guide, contre l'injection SQL).
 */
import knexFactory from 'knex';
import { env } from '../config/env.js';

export const db = knexFactory({
  client: 'pg',
  connection: env.DATABASE_URL,
  pool: { min: 0, max: 10 },
});
