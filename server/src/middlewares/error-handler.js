/**
 * @file Gestion centrale des erreurs et des routes inconnues.
 * Règle technique n° 11 du guide : un seul endroit transforme les erreurs en réponses,
 * avec des messages en français et sans détail interne (pas de pile d'appels, pas de SQL).
 */
import { ZodError } from 'zod';
import { HttpError } from '../utils/http-error.js';

/**
 * Répond 404 pour toute route qui n'existe pas.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export function notFoundHandler(req, res) {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: 'Ressource introuvable.', details: [] },
  });
}

/**
 * Transforme toute erreur en réponse JSON au format du contrat d'API.
 * Express 5 transmet ici les erreurs des fonctions async sans try/catch supplémentaire.
 * @param {Error} err
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} _next - Obligatoire : Express reconnaît un
 *   gestionnaire d'erreurs à ses 4 paramètres.
 */
export function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
  }

  if (err instanceof ZodError) {
    const details = err.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Données invalides.', details },
    });
  }

  // Corps JSON mal formé envoyé par le client.
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: "Le corps de la requête n'est pas un JSON valide.",
        details: [],
      },
    });
  }

  // Erreur imprévue : on la journalise côté serveur, le client reçoit un message générique.
  console.error(err);
  return res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Une erreur interne est survenue. Réessaie plus tard.',
      details: [],
    },
  });
}
