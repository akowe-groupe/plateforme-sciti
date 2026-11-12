/**
 * Tests de l'authentification (C-4, C-5) sur l'application réelle : connexion, cookie de
 * session, accès aux routes métier, mot de passe temporaire (RG-06), profil /me.
 * Comptes utilisés : ceux de « npm run seed », mot de passe SEED_DEMO_PASSWORD.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { app } from '../src/app.js';
import { db } from '../src/db/knex.js';
import { env } from '../src/config/env.js';
import { COOKIE_NAME } from '../src/services/token.service.js';
import { generateTemporaryPassword, passwordProblems } from '../src/services/password.service.js';

const PASSWORD = process.env.SEED_DEMO_PASSWORD;
const NADEGE = 'nadege.houngbo@demo.sciti.test'; // doit changer son mot de passe
let server;
let baseUrl;
let nadegeBefore;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://localhost:${server.address().port}/api`;
  nadegeBefore = await db('users').where({ email: NADEGE }).first();
});

after(async () => {
  // Remet le compte de Nadège dans son état de démonstration.
  await db('users').where({ id: nadegeBefore.id }).update({
    password_hash: nadegeBefore.password_hash,
    must_change_password: true,
  });
  await new Promise((resolve) => server.close(resolve));
  await db.destroy();
});

/** Appel HTTP ; `cookie` = valeur du cookie de session à envoyer. */
async function call(method, path, { body, cookie } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (cookie) headers.Cookie = `${COOKIE_NAME}=${cookie}`;
  const response = await fetch(baseUrl + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const setCookie = response.headers.getSetCookie().find((c) => c.startsWith(`${COOKIE_NAME}=`));
  return { status: response.status, body: text ? JSON.parse(text) : null, setCookie };
}

/** Se connecte et renvoie la valeur du cookie de session. */
async function loginAs(email, password = PASSWORD) {
  const res = await call('POST', '/auth/login', { body: { email, password } });
  assert.equal(res.status, 200, `connexion refusée pour ${email}`);
  return res.setCookie.split(';')[0].split('=').slice(1).join('=');
}

// --- Connexion ---

test('une connexion réussie pose un cookie HttpOnly, SameSite=Strict, limité à /api', async () => {
  const res = await call('POST', '/auth/login', {
    body: { email: 'kevin.ahouansou@demo.sciti.test', password: PASSWORD },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.role, 'student');
  assert.equal(res.body.mustChangePassword, false);
  assert.equal(res.body.user.password_hash, undefined);
  assert.match(res.setCookie, /HttpOnly/);
  assert.match(res.setCookie, /SameSite=Strict/);
  assert.match(res.setCookie, /Path=\/api/);
});

test("l'e-mail est reconnu sans tenir compte des majuscules", async () => {
  const res = await call('POST', '/auth/login', {
    body: { email: 'Kevin.AHOUANSOU@demo.sciti.test', password: PASSWORD },
  });
  assert.equal(res.status, 200);
});

test('mauvais mot de passe et e-mail inconnu donnent exactement la même erreur', async () => {
  const wrongPassword = await call('POST', '/auth/login', {
    body: { email: 'kevin.ahouansou@demo.sciti.test', password: 'faux-mot-de-passe-1' },
  });
  const unknownEmail = await call('POST', '/auth/login', {
    body: { email: 'personne@demo.sciti.test', password: 'faux-mot-de-passe-1' },
  });
  assert.equal(wrongPassword.status, 401);
  assert.equal(unknownEmail.status, 401);
  assert.deepEqual(wrongPassword.body, unknownEmail.body);
  assert.equal(wrongPassword.body.error.code, 'INVALID_CREDENTIALS');
});

test('un e-mail mal formé est refusé par la validation (400)', async () => {
  const res = await call('POST', '/auth/login', { body: { email: 'pas-un-email', password: 'x' } });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
});

// --- Accès aux routes métier ---

test('sans cookie, une route métier répond 401', async () => {
  const res = await call('GET', '/structure/programs');
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'UNAUTHENTICATED');
});

test('un jeton falsifié ou expiré est refusé (401)', async () => {
  const user = await db('users').where({ email: 'kevin.ahouansou@demo.sciti.test' }).first();
  const forged = jwt.sign({}, 'un-autre-secret-de-plus-de-32-caracteres!!', { subject: user.id });
  const expired = jwt.sign({}, env.JWT_SECRET, { subject: user.id, expiresIn: -10 });
  assert.equal((await call('GET', '/structure/programs', { cookie: forged })).status, 401);
  assert.equal((await call('GET', '/structure/programs', { cookie: expired })).status, 401);
});

test('avec le cookie, la route métier répond et applique le périmètre', async () => {
  const cookie = await loginAs('sylvie.hounkpatin@demo.sciti.test');
  const res = await call('GET', '/structure/programs', { cookie });
  assert.equal(res.status, 200);
  assert.equal(res.body.items.length, 1); // le RP ne voit que sa filière
});

// --- Profil /me ---

test("/me d'un étudiant donne sa filière et son année en cours", async () => {
  const cookie = await loginAs('kevin.ahouansou@demo.sciti.test');
  const res = await call('GET', '/auth/me', { cookie });
  assert.equal(res.status, 200);
  assert.ok(res.body.scope.levelId);
  assert.ok(res.body.scope.programId);
  assert.equal(res.body.user.isSuperStudent, true);
});

test("/me d'un professeur liste ses affectations dans les deux filières (RG-04)", async () => {
  const cookie = await loginAs('paul.dossou@demo.sciti.test');
  const res = await call('GET', '/auth/me', { cookie });
  assert.equal(res.body.scope.assignments.length, 2);
  assert.equal(new Set(res.body.scope.assignments.map((a) => a.programId)).size, 2);
});

test("/me du directeur indique qu'il peut corriger les notes (RG-22)", async () => {
  const cookie = await loginAs('marc.adjovi@demo.sciti.test');
  const res = await call('GET', '/auth/me', { cookie });
  assert.equal(res.body.scope.canCorrectGrades, true);
});

// --- Mot de passe temporaire (RG-06) ---

test("mot de passe temporaire : routes métier bloquées jusqu'au changement", async () => {
  const cookie = await loginAs(NADEGE);

  const blocked = await call('GET', '/structure/programs', { cookie });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.error.code, 'PASSWORD_CHANGE_REQUIRED');
  assert.equal((await call('GET', '/auth/me', { cookie })).status, 200);

  const weak = await call('POST', '/auth/change-password', {
    cookie,
    body: { currentPassword: PASSWORD, newPassword: 'court' },
  });
  assert.equal(weak.status, 400);
  assert.equal(weak.body.error.details.length, 2);

  const wrongCurrent = await call('POST', '/auth/change-password', {
    cookie,
    body: { currentPassword: 'mauvais-1234', newPassword: 'NouveauMotDePasse2026' },
  });
  assert.equal(wrongCurrent.status, 401);

  const changed = await call('POST', '/auth/change-password', {
    cookie,
    body: { currentPassword: PASSWORD, newPassword: 'NouveauMotDePasse2026' },
  });
  assert.equal(changed.status, 200);
  assert.equal(changed.body.user.mustChangePassword, false);

  const allowed = await call('GET', '/structure/programs', { cookie });
  assert.equal(allowed.status, 200);
});

// --- Déconnexion ---

test('la déconnexion efface le cookie', async () => {
  const res = await call('POST', '/auth/logout');
  assert.equal(res.status, 204);
  assert.match(res.setCookie, /Expires=Thu, 01 Jan 1970/);
});

// --- Mots de passe ---

test('les mots de passe temporaires sont aléatoires, au format xxx-xxxx-xxx, sans 0/O/1/l/I', () => {
  const samples = Array.from({ length: 200 }, generateTemporaryPassword);
  assert.equal(new Set(samples).size, 200);
  for (const p of samples)
    assert.match(p, /^[A-HJ-NP-Za-km-z2-9]{3}-[A-HJ-NP-Za-km-z2-9]{4}-[A-HJ-NP-Za-km-z2-9]{3}$/);
});

test('règles de robustesse : 10 caractères, une lettre et un chiffre', () => {
  assert.deepEqual(passwordProblems('Abcdefgh12'), []);
  assert.equal(passwordProblems('abcdefghij').length, 1);
  assert.equal(passwordProblems('abc1').length, 1);
});
