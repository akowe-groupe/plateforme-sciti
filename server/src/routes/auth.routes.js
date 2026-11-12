/**
 * @file Routes /api/auth (docs/api.md, § 2).
 * La connexion est la seule route publique ; elle est limitée en nombre de tentatives
 * (express-rate-limit, règle technique n° 10) contre la force brute.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { authenticate } from '../middlewares/authenticate.js';
import { validate } from '../middlewares/validate.js';
import { changePasswordBody, loginBody } from '../schemas/auth.schemas.js';
import * as controller from '../controllers/auth.controller.js';

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.LOGIN_MAX_ATTEMPTS,
  skipSuccessfulRequests: true, // seuls les échecs comptent
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: {
        code: 'TOO_MANY_ATTEMPTS',
        message: 'Trop de tentatives. Réessaie dans 15 minutes.',
        details: [],
      },
    });
  },
});

authRouter.post('/login', loginLimiter, validate({ body: loginBody }), controller.login);

// Les routes suivantes restent ouvertes même si le mot de passe temporaire n'est pas changé.
authRouter.post('/logout', controller.logout);
authRouter.get('/me', authenticate, controller.me);
authRouter.post(
  '/change-password',
  authenticate,
  validate({ body: changePasswordBody }),
  controller.changePassword,
);
