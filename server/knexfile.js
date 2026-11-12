/**
 * @file Configuration de l'outil de migrations Knex (commandes npm run migrate et seed).
 * Voir docs/decisions.md : Knex retenu plutôt que Prisma.
 */
export default {
  client: 'pg',
  connection: process.env.DATABASE_URL,
  migrations: {
    directory: './src/db/migrations',
    tableName: 'knex_migrations',
  },
  seeds: {
    directory: './src/db/seeds',
  },
};
