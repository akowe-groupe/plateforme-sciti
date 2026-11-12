/**
 * Tests des contraintes des tables de base (A-3), dernier rempart de la règle technique n° 5
 * du guide. Outils communs : tests/helpers/db.js.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/db/knex.js';
import { withRollback, assertRefused, createLevel } from './helpers/db.js';

const baseUser = { last_name: 'TEST', first_names: 'Fictif', password_hash: 'x' };

before(async () => {
  await db.migrate.latest({ directory: './src/db/migrations' });
});

after(async () => {
  await db.destroy();
});

test('ajouter une filière, une année et une cohorte se fait par des lignes, sans changer le schéma', async () => {
  await withRollback(async (trx) => {
    const { program, level } = await createLevel(trx, 'Licence en cybersécurité');
    const [nextCohort] = await trx('levels')
      .insert({ program_id: program.id, number: 1, cohort: '2027' })
      .returning('*');
    assert.ok(level.id);
    assert.ok(nextCohort.id);
  });
});

test('refuse une deuxième fois la même année pour la même cohorte', async () => {
  await withRollback(async (trx) => {
    const { program } = await createLevel(trx);
    await assertRefused(
      trx('levels').insert({ program_id: program.id, number: 1, cohort: '2026' }),
      '23505',
    );
  });
});

test('refuse un semestre numéro 3 (RG-09 : deux semestres par année)', async () => {
  await withRollback(async (trx) => {
    const { level } = await createLevel(trx);
    await assertRefused(trx('semesters').insert({ level_id: level.id, number: 3 }), '23514');
  });
});

test('refuse deux semestres en cours pour la même année (RG-26)', async () => {
  await withRollback(async (trx) => {
    const { level } = await createLevel(trx);
    await assertRefused(
      trx('semesters').where({ level_id: level.id, number: 2 }).update({ is_active: true }),
      '23505',
    );
  });
});

test('refuse un module avec un volume horaire nul', async () => {
  await withRollback(async (trx) => {
    const { level } = await createLevel(trx);
    const semester = await trx('semesters').where({ level_id: level.id, number: 1 }).first();
    await assertRefused(
      trx('modules').insert({ semester_id: semester.id, name: 'Vide', total_hours: 0 }),
      '23514',
    );
  });
});

test('refuse une adresse e-mail déjà utilisée, même écrite en majuscules', async () => {
  await withRollback(async (trx) => {
    await trx('users').insert({ ...baseUser, email: 'doublon@demo.sciti.test', role: 'student' });
    await assertRefused(
      trx('users').insert({ ...baseUser, email: 'DOUBLON@demo.sciti.test', role: 'teacher' }),
      '23505',
    );
  });
});

test("refuse un rôle qui n'existe pas", async () => {
  await withRollback(async (trx) => {
    await assertRefused(
      trx('users').insert({ ...baseUser, email: 'role@demo.sciti.test', role: 'admin' }),
      '22P02',
    );
  });
});

test('refuse un RP sans filière (RG-10)', async () => {
  await withRollback(async (trx) => {
    await assertRefused(
      trx('users').insert({ ...baseUser, email: 'rp@demo.sciti.test', role: 'programHead' }),
      '23514',
    );
  });
});

test('refuse un professeur rattaché directement à une filière (ses filières viennent de ses affectations, RG-04)', async () => {
  await withRollback(async (trx) => {
    const { program } = await createLevel(trx);
    await assertRefused(
      trx('users').insert({
        ...baseUser,
        email: 'prof@demo.sciti.test',
        role: 'teacher',
        program_id: program.id,
      }),
      '23514',
    );
  });
});

test("refuse le statut de super étudiant pour un compte qui n'est pas étudiant", async () => {
  await withRollback(async (trx) => {
    await assertRefused(
      trx('users').insert({
        ...baseUser,
        email: 'super@demo.sciti.test',
        role: 'teacher',
        is_super_student: true,
      }),
      '23514',
    );
  });
});

test('refuse deux inscriptions en cours pour le même étudiant (RG-11)', async () => {
  await withRollback(async (trx) => {
    const { program, level } = await createLevel(trx);
    const [otherLevel] = await trx('levels')
      .insert({ program_id: program.id, number: 2, cohort: '2025' })
      .returning('*');
    const [student] = await trx('users')
      .insert({ ...baseUser, email: 'etu@demo.sciti.test', role: 'student' })
      .returning('*');
    await trx('enrollments').insert({ student_id: student.id, level_id: level.id });
    await assertRefused(
      trx('enrollments').insert({ student_id: student.id, level_id: otherLevel.id }),
      '23505',
    );
  });
});

test("garde l'historique : une inscription terminée et une nouvelle en cours coexistent (RG-38)", async () => {
  await withRollback(async (trx) => {
    const { program, level } = await createLevel(trx);
    const [nextLevel] = await trx('levels')
      .insert({ program_id: program.id, number: 2, cohort: '2026' })
      .returning('*');
    const [student] = await trx('users')
      .insert({ ...baseUser, email: 'histo@demo.sciti.test', role: 'student' })
      .returning('*');
    await trx('enrollments').insert({
      student_id: student.id,
      level_id: level.id,
      status: 'promoted',
      closed_at: trx.fn.now(),
    });
    await trx('enrollments').insert({ student_id: student.id, level_id: nextLevel.id });
    const rows = await trx('enrollments').where({ student_id: student.id });
    assert.equal(rows.length, 2);
  });
});

test('un professeur ne peut pas être affecté deux fois au même module', async () => {
  await withRollback(async (trx) => {
    const { level } = await createLevel(trx);
    const semester = await trx('semesters').where({ level_id: level.id, number: 1 }).first();
    const [module] = await trx('modules')
      .insert({ semester_id: semester.id, name: 'Module affectation', total_hours: 10 })
      .returning('*');
    const [teacher] = await trx('users')
      .insert({ ...baseUser, email: 'aff@demo.sciti.test', role: 'teacher' })
      .returning('*');
    await trx('teacher_assignments').insert({ teacher_id: teacher.id, module_id: module.id });
    await assertRefused(
      trx('teacher_assignments').insert({ teacher_id: teacher.id, module_id: module.id }),
      '23505',
    );
  });
});

test('les données de démonstration contiennent un professeur affecté à deux filières (RG-04)', async () => {
  const rows = await db('teacher_assignments as ta')
    .join('modules as m', 'm.id', 'ta.module_id')
    .join('semesters as s', 's.id', 'm.semester_id')
    .join('levels as l', 'l.id', 's.level_id')
    .select('ta.teacher_id')
    .countDistinct({ programs: 'l.program_id' })
    .groupBy('ta.teacher_id')
    .havingRaw('count(distinct l.program_id) > 1');
  assert.ok(rows.length >= 1, 'lancer « npm run seed » avant les tests');
});
