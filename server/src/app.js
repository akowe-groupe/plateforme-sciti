/**
 * @file Création de l'application Express et des middlewares globaux.
 * Ce fichier ne démarre pas le serveur (voir server.js) : les tests importent l'application
 * sans ouvrir de port fixe.
 */
import express from 'express';
import helmet from 'helmet';
import { healthRouter } from './routes/health.routes.js';
import { errorHandler, notFoundHandler } from './middlewares/error-handler.js';

export const app = express();

// Règle technique n° 10 : en-têtes de sécurité HTTP.
app.use(helmet());
// Limite de taille du corps : l'API n'attend que de petits JSON.
app.use(express.json({ limit: '100kb' }));

app.use('/api/health', healthRouter);
// Les routes des domaines (auth, accounts, structure, schedule...) seront ajoutées ici
// au fil des tâches A-5 à A-13, chacune derrière les middlewares de droits de C.

app.use(notFoundHandler);
app.use(errorHandler);
