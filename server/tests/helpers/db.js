/**
 * Outils partagés par les tests de la base.
 * Chaque test travaille dans une transaction annulée à la fin : les données de
 * démonstration ne sont jamais modifiées.
 *
 * Codes d'erreur PostgreSQL : 23505 = doublon (UNIQUE), 23514 = CHECK refusé,
 * 22P02 = valeur hors ENUM, 23503 = clé étrangère inexistante.
 */
import assert from 'node:assert/strict';
import { db } from '../../src/db/knex.js';

export const PG = { UNIQUE: '23505', CHECK: '23514', ENUM: '22P02', FOREIGN_KEY: '23503' };

/** Exécute fn dans une transaction, puis l'annule quoi qu'il arrive. */
export async function withRollback(fn) {
  const trx = await db.transaction();
  try {
    await fn(trx);
  } finally {
    await trx.rollback();
  }
}

/** Vérifie qu'une requête est refusée par la base avec le code PostgreSQL attendu. */
export async function assertRefused(query, pgCode) {
  await assert.rejects(query, (err) => {
    assert.equal(err.code, pgCode);
    return true;
  });
}

let emailCounter = 0;

/** Ligne users minimale et fictive, avec une adresse unique. */
export function fakeUser(role, extra = {}) {
  emailCounter += 1;
  return {
    last_name: 'TEST',
    first_names: 'Fictif',
    email: `test${emailCounter}-${Date.now()}@demo.sciti.test`,
    password_hash: 'x',
    role,
    ...extra,
  };
}

/** Crée une filière avec une année, ses deux semestres et un module du semestre 1. */
export async function createLevel(trx, programName = 'Filière de test') {
  const [program] = await trx('programs')
    .insert({ name: programName, duration_years: 3 })
    .returning('*');
  const [level] = await trx('levels')
    .insert({ program_id: program.id, number: 1, cohort: '2026' })
    .returning('*');
  const [semester1] = await trx('semesters')
    .insert([
      { level_id: level.id, number: 1, is_active: true },
      { level_id: level.id, number: 2, is_active: false },
    ])
    .returning('*');
  const [module] = await trx('modules')
    .insert({ semester_id: semester1.id, name: 'Module test', total_hours: 20 })
    .returning('*');
  return { program, level, semester1, module };
}

/**
 * Jeu complet pour un test : une année, un module, un professeur affecté, un étudiant
 * inscrit, un directeur et une séance prévue de 2 heures.
 */
export async function createClassroom(trx) {
  const { program, level, module } = await createLevel(trx);
  const [teacher, student, director] = await trx('users')
    .insert([fakeUser('teacher'), fakeUser('student'), fakeUser('director')])
    .returning('*');
  await trx('teacher_assignments').insert({ teacher_id: teacher.id, module_id: module.id });
  await trx('enrollments').insert({ student_id: student.id, level_id: level.id });
  const [session] = await trx('sessions')
    .insert({
      module_id: module.id,
      teacher_id: teacher.id,
      starts_at: '2026-11-23T07:00:00Z',
      ends_at: '2026-11-23T09:00:00Z',
    })
    .returning('*');
  return { program, level, module, teacher, student, director, session };
}
