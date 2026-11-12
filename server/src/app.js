/**
 * @file Création de l'application Express et des middlewares globaux.
 * Ce fichier ne démarre pas le serveur (voir server.js) : les tests importent l'application
 * sans ouvrir de port fixe.
 */
import express from 'express';
import helmet from 'helmet';
import { healthRouter } from './routes/health.routes.js';
import { structureRouter } from './routes/structure.routes.js';
import { errorHandler, notFoundHandler } from './middlewares/error-handler.js';

export const app = express();

// Règle technique n° 10 : en-têtes de sécurité HTTP.
app.use(helmet());
// Limite de taille du corps : l'API n'attend que de petits JSON.
app.use(express.json({ limit: '100kb' }));

app.use('/api/health', healthRouter);

// Le middleware d'authentification de C (C-4, C-5) se place ici : il vérifie le jeton et
// remplit req.user. Tant qu'il n'existe pas, les routes métier répondent 401.
app.use('/api/structure', structureRouter);
// Les autres domaines (auth, accounts, schedule...) arrivent avec A-5 à A-13.

app.use(notFoundHandler);
app.use(errorHandler);
