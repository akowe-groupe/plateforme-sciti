/**
 * Limite des tentatives de connexion (règle technique n° 10, force brute).
 * Fichier séparé : node:test lance chaque fichier dans son propre processus, donc ce
 * compteur ne gêne pas les autres tests de connexion.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../src/app.js';
import { db } from '../src/db/knex.js';
import { env } from '../src/config/env.js';

let server;
let url;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  url = `http://localhost:${server.address().port}/api/auth/login`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await db.destroy();
});

test(`au-delà de ${env.LOGIN_MAX_ATTEMPTS} échecs en 15 min, la connexion répond 429`, async () => {
  const attempt = () =>
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'kevin.ahouansou@demo.sciti.test', password: 'mauvais-1234' }),
    });
  for (let i = 0; i < env.LOGIN_MAX_ATTEMPTS; i += 1) {
    assert.equal((await attempt()).status, 401);
  }
  const blocked = await attempt();
  assert.equal(blocked.status, 429);
  assert.equal((await blocked.json()).error.code, 'TOO_MANY_ATTEMPTS');
});
