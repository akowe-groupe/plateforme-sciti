/**
 * Tests des routes /api/structure (A-6) : utilisateur requis, validation Zod en français,
 * codes HTTP du contrat d'API.
 *
 * En attendant le middleware de C, une petite application de test place l'utilisateur choisi
 * dans req.user, comme le fera le vrai middleware. Ce raccourci n'existe que dans ce fichier.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { db } from '../src/db/knex.js';
import { structureRouter } from '../src/routes/structure.routes.js';
import { errorHandler } from '../src/middlewares/error-handler.js';
import { loadActors, loadStructure } from './helpers/actors.js';

let A;
let S;
let server;
let baseUrl;
let currentUser = null;
const createdModuleIds = [];

before(async () => {
  A = await loadActors();
  S = await loadStructure();
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    if (currentUser) req.user = currentUser;
    next();
  });
  app.use('/api/structure', structureRouter);
  app.use(errorHandler);
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://localhost:${server.address().port}/api/structure`;
});

after(async () => {
  if (createdModuleIds.length) await db('modules').whereIn('id', createdModuleIds).del();
  await new Promise((resolve) => server.close(resolve));
  await db.destroy();
});

/** Appelle l'API en tant que `user` (null = personne de connecté). */
async function call(user, method, path, body) {
  currentUser = user;
  const response = await fetch(baseUrl + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

test('sans utilisateur connecté, la route répond 401 UNAUTHENTICATED', async () => {
  const res = await call(null, 'GET', '/programs');
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'UNAUTHENTICATED');
});

test('GET /programs renvoie les filières du périmètre', async () => {
  const res = await call(A.rpBachelor, 'GET', '/programs');
  assert.equal(res.status, 200);
  assert.equal(res.body.items.length, 1);
  assert.equal(res.body.items[0].name, S.bachelor.name);
});

test('un identifiant mal formé répond 400 avec un message en français', async () => {
  const res = await call(A.director, 'GET', '/levels/pas-un-uuid');
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  assert.equal(res.body.error.details[0].field, 'levelId');
  assert.match(res.body.error.details[0].message, /UUID invalide/);
});

test('un corps invalide répond 400 avec le détail par champ', async () => {
  const res = await call(A.rpBachelor, 'POST', `/programs/${S.bachelor.id}/levels`, {
    number: 0,
    cohort: '',
  });
  assert.equal(res.status, 400);
  assert.deepEqual(res.body.error.details.map((d) => d.field).sort(), ['cohort', 'number']);
});

test('une année inconnue répond 404', async () => {
  const res = await call(A.director, 'GET', '/levels/00000000-0000-4000-8000-000000000000');
  assert.equal(res.status, 404);
  assert.equal(res.body.error.code, 'NOT_FOUND');
});

test('un semestre en cours égal à 3 est refusé', async () => {
  const res = await call(
    A.rpBachelor,
    'PATCH',
    `/levels/${S.level(S.bachelor, 2).id}/current-semester`,
    {
      semesterNumber: 3,
    },
  );
  assert.equal(res.status, 400);
});

test("création puis suppression d'un module : 201 puis 204", async () => {
  const semesterId = S.module('Bases de données').semester_id;
  const created = await call(A.rpBachelor, 'POST', `/semesters/${semesterId}/modules`, {
    name: `Module de test ${Date.now()}`,
    totalHours: 12,
  });
  assert.equal(created.status, 201);
  createdModuleIds.push(created.body.module.id);

  const removed = await call(A.rpBachelor, 'DELETE', `/modules/${created.body.module.id}`);
  assert.equal(removed.status, 204);
});

test('le RP du Master reçoit 403 sur un module du Bachelor', async () => {
  const res = await call(A.rpMaster, 'PATCH', `/modules/${S.module('Bases de données').id}`, {
    name: 'Renommé',
  });
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'FORBIDDEN');
});
