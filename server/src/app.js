/**
 * @file Création de l'application Express et des middlewares globaux.
 * Ce fichier ne démarre pas le serveur (voir server.js) : les tests importent l'application
 * sans ouvrir de port fixe.
 */
import express from 'express';
import helmet from 'helmet';
import { healthRouter } from './routes/health.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { structureRouter } from './routes/structure.routes.js';
import { authenticate, requirePasswordChanged } from './middlewares/authenticate.js';
import { errorHandler, notFoundHandler } from './middlewares/error-handler.js';

export const app = express();

// Derrière l'hébergeur (proxy), l'adresse IP réelle sert à limiter les tentatives de connexion.
app.set('trust proxy', 1);
// Règle technique n° 10 : en-têtes de sécurité HTTP.
app.use(helmet());
// Limite de taille du corps : l'API n'attend que de petits JSON.
app.use(express.json({ limit: '100kb' }));

// Routes publiques ou qui gèrent elles-mêmes la session.
app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);

// Toutes les routes métier : session valide (RG-08) et mot de passe temporaire changé (RG-06).
const business = [authenticate, requirePasswordChanged];
app.use('/api/structure', ...business, structureRouter);
// Les autres domaines (accounts, schedule, attendance...) arrivent avec A-5 à A-13.

app.use(notFoundHandler);
app.use(errorHandler);
