/**
 * @file Route de santé : permet à l'équipe et à l'hébergeur de vérifier que l'API répond
 * et que la base de données est joignable (critère de fin de A-3).
 */
import { Router } from 'express';
import { db } from '../db/knex.js';

export const healthRouter = Router();

healthRouter.get('/', async (req, res) => {
  let database = 'ok';
  try {
    await db.raw('select 1');
  } catch {
    database = 'indisponible';
  }
  const status = database === 'ok' ? 200 : 503;
  res.status(status).json({ status: database === 'ok' ? 'ok' : 'degraded', database });
});
