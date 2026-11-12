/**
 * Tests des contraintes du schéma complet (A-4) : séances, présences, notes, historique,
 * délégations, canaux, publications, notifications.
 * Les délais (15 minutes, 5 minutes, plage de séance) seront testés avec les services
 * (A-9, A-12) : ici, on vérifie ce que la base garantit seule.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/db/knex.js';
import { PG, withRollback, assertRefused, fakeUser, createClassroom } from './helpers/db.js';

before(async () => {
  await db.migrate.latest({ directory: './src/db/migrations' });
});

after(async () => {
  await db.destroy();
});

// --- Séances ---

test('refuse une séance qui finit avant de commencer', async () => {
  await withRollback(async (trx) => {
    const { module, teacher } = await createClassroom(trx);
    await assertRefused(
      trx('sessions').insert({
        module_id: module.id,
        teacher_id: teacher.id,
        starts_at: '2026-11-24T09:00:00Z',
        ends_at: '2026-11-24T08:00:00Z',
      }),
      PG.CHECK,
    );
  });
});

test('refuse une séance de plus de 12 heures (erreur de date probable)', async () => {
  await withRollback(async (trx) => {
    const { module, teacher } = await createClassroom(trx);
    await assertRefused(
      trx('sessions').insert({
        module_id: module.id,
        teacher_id: teacher.id,
        starts_at: '2026-11-24T08:00:00Z',
        ends_at: '2026-11-25T08:00:00Z',
      }),
      PG.CHECK,
    );
  });
});

test('refuse une séance « confirmée » sans date ni auteur de confirmation (RG-28)', async () => {
  await withRollback(async (trx) => {
    const { session } = await createClassroom(trx);
    await assertRefused(
      trx('sessions').where({ id: session.id }).update({ status: 'confirmed' }),
      PG.CHECK,
    );
  });
});

test('accepte une confirmation complète, puis son annulation par le RP (RG-28)', async () => {
  await withRollback(async (trx) => {
    const { session, teacher } = await createClassroom(trx);
    await trx('sessions')
      .where({ id: session.id })
      .update({ status: 'confirmed', confirmed_at: trx.fn.now(), confirmed_by: teacher.id });
    await trx('sessions')
      .where({ id: session.id })
      .update({ status: 'scheduled', confirmed_at: null, confirmed_by: null });
    const row = await trx('sessions').where({ id: session.id }).first();
    assert.equal(row.status, 'scheduled');
  });
});

test("refuse une séance « annulée » sans date d'annulation (RG-13)", async () => {
  await withRollback(async (trx) => {
    const { session } = await createClassroom(trx);
    await assertRefused(
      trx('sessions').where({ id: session.id }).update({ status: 'cancelled' }),
      PG.CHECK,
    );
  });
});

test("refuse d'annuler une séance dont la présence a déjà été pointée", async () => {
  await withRollback(async (trx) => {
    const { session, teacher } = await createClassroom(trx);
    await trx('sessions')
      .where({ id: session.id })
      .update({ attendance_validated_at: trx.fn.now(), attendance_validated_by: teacher.id });
    await assertRefused(
      trx('sessions')
        .where({ id: session.id })
        .update({ status: 'cancelled', cancelled_at: trx.fn.now() }),
      PG.CHECK,
    );
  });
});

test('refuse un statut de séance inconnu', async () => {
  await withRollback(async (trx) => {
    const { session } = await createClassroom(trx);
    await assertRefused(
      trx('sessions').where({ id: session.id }).update({ status: 'reportée' }),
      PG.ENUM,
    );
  });
});

// --- Présences ---

test('refuse une présence autre que P ou A (RG-18)', async () => {
  await withRollback(async (trx) => {
    const { session, student } = await createClassroom(trx);
    await assertRefused(
      trx('attendance_records').insert({
        session_id: session.id,
        student_id: student.id,
        value: 'R',
      }),
      PG.ENUM,
    );
  });
});

test('refuse deux pointages du même étudiant pour la même séance', async () => {
  await withRollback(async (trx) => {
    const { session, student } = await createClassroom(trx);
    await trx('attendance_records').insert({
      session_id: session.id,
      student_id: student.id,
      value: 'P',
    });
    await assertRefused(
      trx('attendance_records').insert({
        session_id: session.id,
        student_id: student.id,
        value: 'A',
      }),
      PG.UNIQUE,
    );
  });
});

// --- Notes ---

test('refuse une note autre que A, B ou F (RG-20)', async () => {
  await withRollback(async (trx) => {
    const { module, student, teacher } = await createClassroom(trx);
    await assertRefused(
      trx('grades').insert({
        student_id: student.id,
        module_id: module.id,
        value: 'C',
        entered_by: teacher.id,
      }),
      PG.ENUM,
    );
  });
});

test('refuse une deuxième note pour le même étudiant et le même module (RG-20)', async () => {
  await withRollback(async (trx) => {
    const { module, student, teacher } = await createClassroom(trx);
    const grade = { student_id: student.id, module_id: module.id, entered_by: teacher.id };
    await trx('grades').insert({ ...grade, value: 'B' });
    await assertRefused(trx('grades').insert({ ...grade, value: 'A' }), PG.UNIQUE);
  });
});

test('refuse une note « publiée » sans date ni auteur de publication (RG-24)', async () => {
  await withRollback(async (trx) => {
    const { module, student, teacher } = await createClassroom(trx);
    await assertRefused(
      trx('grades').insert({
        student_id: student.id,
        module_id: module.id,
        value: 'A',
        entered_by: teacher.id,
        status: 'published',
      }),
      PG.CHECK,
    );
  });
});

test('refuse une trace de correction sans motif (RG-23)', async () => {
  await withRollback(async (trx) => {
    const { module, student, teacher, director } = await createClassroom(trx);
    const [grade] = await trx('grades')
      .insert({ student_id: student.id, module_id: module.id, value: 'F', entered_by: teacher.id })
      .returning('*');
    await assertRefused(
      trx('grade_history').insert({
        grade_id: grade.id,
        old_value: 'F',
        new_value: 'B',
        author_id: director.id,
        reason: '   ',
      }),
      PG.CHECK,
    );
  });
});

test('refuse une trace de correction où la note ne change pas', async () => {
  await withRollback(async (trx) => {
    const { module, student, teacher, director } = await createClassroom(trx);
    const [grade] = await trx('grades')
      .insert({ student_id: student.id, module_id: module.id, value: 'B', entered_by: teacher.id })
      .returning('*');
    await assertRefused(
      trx('grade_history').insert({
        grade_id: grade.id,
        old_value: 'B',
        new_value: 'B',
        author_id: director.id,
        reason: 'Erreur de saisie',
      }),
      PG.CHECK,
    );
  });
});

test('refuse une délégation temporaire sans date de fin (RG-22)', async () => {
  await withRollback(async (trx) => {
    const { program, director } = await createClassroom(trx);
    const [head] = await trx('users')
      .insert(fakeUser('programHead', { program_id: program.id }))
      .returning('*');
    await assertRefused(
      trx('grade_delegations').insert({
        program_head_id: head.id,
        granted_by: director.id,
        type: 'temporary',
      }),
      PG.CHECK,
    );
  });
});

test('refuse une délégation durable avec une date de fin', async () => {
  await withRollback(async (trx) => {
    const { program, director } = await createClassroom(trx);
    const [head] = await trx('users')
      .insert(fakeUser('programHead', { program_id: program.id }))
      .returning('*');
    await assertRefused(
      trx('grade_delegations').insert({
        program_head_id: head.id,
        granted_by: director.id,
        type: 'permanent',
        ends_at: '2027-01-01T00:00:00Z',
      }),
      PG.CHECK,
    );
  });
});

// --- Canaux et publications ---

test("le canal général existe et il ne peut y en avoir qu'un (RG-30)", async () => {
  await withRollback(async (trx) => {
    const general = await trx('channels').where({ scope: 'general' });
    assert.equal(general.length, 1);
    await assertRefused(trx('channels').insert({ scope: 'general' }), PG.UNIQUE);
  });
});

test('chaque filière et chaque année des données de démo ont leur canal (RG-30)', async () => {
  const programsWithout = await db('programs')
    .whereNotIn('id', db('channels').whereNotNull('program_id').select('program_id'))
    .count({ n: '*' })
    .first();
  const levelsWithout = await db('levels')
    .whereNotIn('id', db('channels').whereNotNull('level_id').select('level_id'))
    .count({ n: '*' })
    .first();
  assert.equal(Number(programsWithout.n), 0);
  assert.equal(Number(levelsWithout.n), 0);
});

test('refuse un canal de filière sans filière, ou rattaché aussi à une année', async () => {
  await withRollback(async (trx) => {
    const { level } = await createClassroom(trx);
    await assertRefused(trx('channels').insert({ scope: 'program', level_id: level.id }), PG.CHECK);
  });
});

test('refuse une publication vide', async () => {
  await withRollback(async (trx) => {
    const { director } = await createClassroom(trx);
    const general = await trx('channels').where({ scope: 'general' }).first();
    await assertRefused(
      trx('posts').insert({
        channel_id: general.id,
        author_id: director.id,
        title: 'Rentrée',
        content: '  ',
      }),
      PG.CHECK,
    );
  });
});

test("une publication masquée garde la trace de qui l'a masquée (RG-35)", async () => {
  await withRollback(async (trx) => {
    const { director } = await createClassroom(trx);
    const general = await trx('channels').where({ scope: 'general' }).first();
    const [post] = await trx('posts')
      .insert({ channel_id: general.id, author_id: director.id, title: 'Info', content: 'Texte' })
      .returning('*');
    await assertRefused(
      trx('posts').where({ id: post.id }).update({ hidden_at: trx.fn.now() }),
      PG.CHECK,
    );
  });
});

// --- Notifications ---

test('refuse une notification de séance qui ne pointe vers aucune séance (RG-14)', async () => {
  await withRollback(async (trx) => {
    const { student } = await createClassroom(trx);
    await assertRefused(
      trx('notifications').insert({
        recipient_id: student.id,
        type: 'SESSION_CANCELLED',
        content: 'Séance annulée',
      }),
      PG.CHECK,
    );
  });
});

test("accepte une notification de passage d'année sans séance (RG-36)", async () => {
  await withRollback(async (trx) => {
    const { student } = await createClassroom(trx);
    const [notification] = await trx('notifications')
      .insert({
        recipient_id: student.id,
        type: 'YEAR_DECISION',
        content: 'Tu passes en 2e année.',
      })
      .returning('*');
    assert.equal(notification.read_at, null);
  });
});
