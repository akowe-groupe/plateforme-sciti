/**
 * Tests de la route de santé et du format des erreurs (docs/api.md, § 0.5).
 * Le serveur est démarré sur un port libre choisi par le système (port 0).
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../src/app.js';
import { db } from '../src/db/knex.js';

let server;
let baseUrl;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://localhost:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await db.destroy();
});

test('GET /api/health répond 200 quand la base est joignable', async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok', database: 'ok' });
});

test("une route inconnue répond 404 au format d'erreur du contrat", async () => {
  const response = await fetch(`${baseUrl}/api/inexistante`);
  assert.equal(response.status, 404);
  const body = await response.json();
  assert.equal(body.error.code, 'NOT_FOUND');
  assert.equal(typeof body.error.message, 'string');
});

test('un JSON mal formé répond 400 VALIDATION_ERROR sans détail interne', async () => {
  const response = await fetch(`${baseUrl}/api/health`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{ pas du json',
  });
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error.code, 'VALIDATION_ERROR');
});

test('les en-têtes de sécurité de helmet sont présents', async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-powered-by'), null);
});
