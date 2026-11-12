/**
 * @file Jeton de session (JWT) et cookie qui le transporte.
 * Règle technique n° 10 du guide : jeton à durée de vie courte, HTTPS en production.
 *
 * Le jeton voyage dans un cookie HttpOnly : le code JavaScript de la page ne peut pas le
 * lire, donc une faille XSS ne peut pas le voler. SameSite=Strict empêche un autre site
 * d'envoyer une requête avec ce cookie (protection CSRF).
 */
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export const COOKIE_NAME = 'sciti_session';

/** Durée de validité en millisecondes, à partir de « 30m » ou « 2h ». */
const lifetimeMs = (() => {
  const value = Number(env.JWT_EXPIRES_IN.slice(0, -1));
  return env.JWT_EXPIRES_IN.endsWith('h') ? value * 3600_000 : value * 60_000;
})();

/**
 * Signe un jeton pour un utilisateur. Le jeton ne contient que l'identifiant : le rôle et
 * le périmètre sont relus en base à chaque requête, donc un changement de rôle ou une
 * désactivation s'applique tout de suite.
 * @param {string} userId
 * @returns {string}
 */
export function signToken(userId) {
  return jwt.sign({}, env.JWT_SECRET, {
    subject: userId,
    expiresIn: Math.floor(lifetimeMs / 1000),
    algorithm: 'HS256',
  });
}

/**
 * Vérifie un jeton. Renvoie null s'il est absent, falsifié ou expiré.
 * @param {string|undefined} token
 * @returns {{sub: string, iat: number, exp: number}|null}
 */
export function verifyToken(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    return null;
  }
}

/** Options du cookie : Secure seulement en production (HTTPS), le local tourne en HTTP. */
function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: env.NODE_ENV === 'production',
    path: '/api',
    maxAge: lifetimeMs,
  };
}

/** Pose le cookie de session sur la réponse. */
export function setSessionCookie(res, userId) {
  res.cookie(COOKIE_NAME, signToken(userId), cookieOptions());
}

/** Efface le cookie de session (déconnexion). */
export function clearSessionCookie(res) {
  const options = cookieOptions();
  delete options.maxAge; // clearCookie fixe lui-même une date passée
  res.clearCookie(COOKIE_NAME, options);
}

/**
 * Lit le cookie de session dans l'en-tête Cookie, sans dépendance supplémentaire.
 * @param {import('express').Request} req
 * @returns {string|undefined}
 */
export function readSessionCookie(req) {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === COOKIE_NAME) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

/** Moitié de la durée de vie : au-delà, le jeton est renouvelé (session glissante). */
export const RENEW_AFTER_SECONDS = Math.floor(lifetimeMs / 2000);
