/**
 * Tests des routes /api/accounts (A-5) sur l'application réelle, avec une vraie connexion :
 * validation des entrées, codes HTTP, mot de passe temporaire renvoyé une seule fois.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../src/app.js';
import { db } from '../src/db/knex.js';
import { COOKIE_NAME } from '../src/services/token.service.js';
import { loadStructure } from './helpers/actors.js';

const PASSWORD = process.env.SEED_DEMO_PASSWORD;
const TEST_EMAIL = `route.test.${Date.now()}@demo.sciti.test`;
let S;
let server;
let baseUrl;
let rpCookie;

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

async function loginAs(email) {
  const res = await call('POST', '/auth/login', { body: { email, password: PASSWORD } });
  return res.setCookie.split(';')[0].split('=').slice(1).join('=');
}

before(async () => {
  S = await loadStructure();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://localhost:${server.address().port}/api`;
  rpCookie = await loginAs('sylvie.hounkpatin@demo.sciti.test');
});

after(async () => {
  const created = await db('users').where({ email: TEST_EMAIL }).first();
  if (created) {
    await db('enrollments').where({ student_id: created.id }).del();
    await db('users').where({ id: created.id }).del();
  }
  await new Promise((resolve) => server.close(resolve));
  await db.destroy();
});

test('POST /accounts/students : 201, e-mail mis en minuscules, mot de passe temporaire', async () => {
  const res = await call('POST', '/accounts/students', {
    cookie: rpCookie,
    body: {
      lastName: 'ROUTE',
      firstNames: 'Test',
      email: TEST_EMAIL.toUpperCase(),
      phone: '+229 01 00 00 98',
      levelId: S.level(S.bachelor, 1).id,
    },
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.user.email, TEST_EMAIL);
  assert.ok(res.body.temporaryPassword);
  assert.equal(res.body.user.password_hash, undefined);
});

test('un e-mail ou un numéro mal formé est refusé avec le détail par champ', async () => {
  const res = await call('POST', '/accounts/students', {
    cookie: rpCookie,
    body: {
      lastName: 'X',
      firstNames: 'Y',
      email: 'pas-un-email',
      phone: 'abc',
      levelId: S.level(S.bachelor, 1).id,
    },
  });
  assert.equal(res.status, 400);
  assert.deepEqual(res.body.error.details.map((d) => d.field).sort(), ['email', 'phone']);
});

test('GET /accounts filtre par rôle et pagine', async () => {
  const res = await call('GET', '/accounts?role=student&pageSize=2', { cookie: rpCookie });
  assert.equal(res.status, 200);
  assert.equal(res.body.items.length, 2);
  assert.ok(res.body.total >= 7);
});

test('GET /accounts/teachers/search est bien lu comme une recherche', async () => {
  const res = await call('GET', '/accounts/teachers/search?lastName=dossou', { cookie: rpCookie });
  assert.equal(res.status, 200);
  assert.equal(res.body.items[0].lastName, 'DOSSOU');
});

test('un étudiant connecté reçoit 403 sur la liste des comptes', async () => {
  const cookie = await loginAs('kevin.ahouansou@demo.sciti.test');
  const res = await call('GET', '/accounts', { cookie });
  assert.equal(res.status, 403);
});

test('sans connexion, 401', async () => {
  assert.equal((await call('GET', '/accounts')).status, 401);
});
