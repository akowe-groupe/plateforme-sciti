/**
 * @file Point d'entrée : démarre le serveur HTTP et l'arrête proprement.
 */
import { env } from './config/env.js';
import { app } from './app.js';
import { db } from './db/knex.js';

const server = app.listen(env.PORT, () => {
  console.log(`API SCITI démarrée sur http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

/** Ferme les connexions en cours puis la base, pour ne rien couper au milieu d'une écriture. */
async function shutdown() {
  server.close(async () => {
    await db.destroy();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
