/**
 * Tests du service de structure académique (A-6) : périmètre par rôle (RG-08, RG-10),
 * création de filières, d'années et de modules (RG-09, RG-26), semestre en cours (RG-29).
 * Chaque test travaille dans une transaction annulée : les données de démo ne bougent pas.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/db/knex.js';
import * as structure from '../src/services/structure.service.js';
import { withRollback } from './helpers/db.js';
import { loadActors, loadStructure } from './helpers/actors.js';

let A; // utilisateurs de démo
let S; // repères de la structure de démo

before(async () => {
  A = await loadActors();
  S = await loadStructure();
});

after(async () => {
  await db.destroy();
});

/** Vérifie qu'une promesse échoue avec le statut et le code HTTP attendus. */
async function assertHttpError(promise, status, code) {
  await assert.rejects(promise, (err) => {
    assert.equal(err.status, status);
    assert.equal(err.code, code);
    return true;
  });
}

// --- Lecture des filières selon le rôle ---

test('le directeur voit les deux filières et toutes leurs années', async () => {
  const { items } = await structure.listPrograms(A.director);
  assert.equal(items.length, 2);
  assert.equal(items.flatMap((p) => p.levels).length, 3);
});

test('le RP du Bachelor ne voit que sa filière (RG-10)', async () => {
  const { items } = await structure.listPrograms(A.rpBachelor);
  assert.deepEqual(
    items.map((p) => p.id),
    [S.bachelor.id],
  );
  assert.equal(items[0].levels.length, 2);
  assert.equal(items[0].levels[0].currentSemesterNumber, 1);
});

test('un professeur dans deux filières voit seulement les années où il enseigne (RG-04)', async () => {
  const { items } = await structure.listPrograms(A.teacherDossou);
  const levelIds = items.flatMap((p) => p.levels.map((l) => l.id)).sort();
  assert.deepEqual(levelIds, [S.level(S.bachelor, 2).id, S.level(S.master, 1).id].sort());
});

test('un étudiant ne voit que sa filière et son année', async () => {
  const { items } = await structure.listPrograms(A.studentB2);
  assert.equal(items.length, 1);
  assert.deepEqual(
    items[0].levels.map((l) => l.id),
    [S.level(S.bachelor, 2).id],
  );
});

// --- Création d'une filière ---

test('le directeur crée une filière et son canal (RG-09, RG-30)', async () => {
  await withRollback(async (trx) => {
    const result = await structure.createProgram(
      A.director,
      { name: 'Licence en cybersécurité', durationYears: 3 },
      trx,
    );
    assert.equal(result.program.durationYears, 3);
    const channel = await trx('channels').where({ id: result.channelId }).first();
    assert.equal(channel.program_id, result.program.id);
  });
});

test('un RP ne peut pas créer de filière', async () => {
  await withRollback(async (trx) => {
    await assertHttpError(
      structure.createProgram(A.rpBachelor, { name: 'Autre', durationYears: 2 }, trx),
      403,
      'FORBIDDEN',
    );
  });
});

test('refuse une filière dont le nom existe déjà', async () => {
  await withRollback(async (trx) => {
    await assertHttpError(
      structure.createProgram(A.director, { name: S.bachelor.name, durationYears: 4 }, trx),
      409,
      'PROGRAM_NAME_TAKEN',
    );
  });
});

// --- Création d'une année ---

test("l'adjoint crée une année : deux semestres, le premier en cours, et un canal", async () => {
  await withRollback(async (trx) => {
    const result = await structure.createLevel(
      A.assistantBachelor,
      S.bachelor.id,
      { number: 3, cohort: '2024' },
      trx,
    );
    assert.deepEqual(
      result.semesters.map((s) => [s.number, s.active]),
      [
        [1, true],
        [2, false],
      ],
    );
    const channel = await trx('channels').where({ id: result.channelId }).first();
    assert.equal(channel.level_id, result.level.id);
  });
});

test("le RP du Master ne peut pas créer d'année dans le Bachelor (RG-10)", async () => {
  await withRollback(async (trx) => {
    await assertHttpError(
      structure.createLevel(A.rpMaster, S.bachelor.id, { number: 3, cohort: '2024' }, trx),
      403,
      'FORBIDDEN',
    );
  });
});

test('refuse une année au-delà de la durée de la filière (Master : 2 ans)', async () => {
  await withRollback(async (trx) => {
    await assertHttpError(
      structure.createLevel(A.director, S.master.id, { number: 3, cohort: '2026' }, trx),
      400,
      'VALIDATION_ERROR',
    );
  });
});

test('refuse une année déjà existante pour la même cohorte', async () => {
  await withRollback(async (trx) => {
    await assertHttpError(
      structure.createLevel(A.rpBachelor, S.bachelor.id, { number: 1, cohort: '2026' }, trx),
      409,
      'LEVEL_ALREADY_EXISTS',
    );
  });
});

// --- Détail d'une année ---

test("le détail d'une année liste semestres, modules et professeurs", async () => {
  const result = await structure.getLevel(A.teacherDossou, S.level(S.bachelor, 2).id);
  const s1 = result.semesters.find((s) => s.number === 1);
  const bd = s1.modules.find((m) => m.name === 'Bases de données');
  assert.equal(bd.totalHours, 30);
  assert.deepEqual(
    bd.teachers.map((t) => t.name),
    ['DOSSOU Paul'],
  );
});

test("un étudiant ne peut pas consulter l'année d'une autre filière", async () => {
  await assertHttpError(structure.getLevel(A.studentB2, S.level(S.master, 1).id), 403, 'FORBIDDEN');
});

// --- Semestre en cours ---

test('passer au semestre 2 laisse un seul semestre actif (RG-29)', async () => {
  await withRollback(async (trx) => {
    const levelId = S.level(S.bachelor, 2).id;
    await structure.setCurrentSemester(A.rpBachelor, levelId, 2, trx);
    const active = await trx('semesters').where({ level_id: levelId, is_active: true });
    assert.deepEqual(
      active.map((s) => s.number),
      [2],
    );
  });
});

// --- Modules ---

test('crée un module, puis refuse un deuxième module du même nom dans le semestre', async () => {
  await withRollback(async (trx) => {
    const semesterId = S.module('Bases de données').semester_id;
    const { module } = await structure.createModule(
      A.rpBachelor,
      semesterId,
      { name: 'Statistiques avancées', totalHours: 22.5 },
      trx,
    );
    assert.equal(module.totalHours, 22.5);
    await assertHttpError(
      structure.createModule(
        A.rpBachelor,
        semesterId,
        { name: 'Bases de données', totalHours: 10 },
        trx,
      ),
      409,
      'MODULE_NAME_TAKEN',
    );
  });
});

test('un professeur ne peut pas créer de module', async () => {
  await withRollback(async (trx) => {
    await assertHttpError(
      structure.createModule(
        A.teacherDossou,
        S.module('Bases de données').semester_id,
        { name: 'Nouveau', totalHours: 10 },
        trx,
      ),
      403,
      'FORBIDDEN',
    );
  });
});

/** Ajoute à un module une séance confirmée de 2 heures. */
async function addConfirmedSession(trx, moduleRow, teacherId) {
  await trx('sessions').insert({
    module_id: moduleRow.id,
    teacher_id: teacherId,
    starts_at: '2026-11-16T07:00:00Z',
    ends_at: '2026-11-16T09:00:00Z',
    status: 'confirmed',
    confirmed_at: trx.fn.now(),
    confirmed_by: teacherId,
  });
}

test('refuse un volume horaire inférieur aux heures déjà confirmées (RG-28)', async () => {
  await withRollback(async (trx) => {
    const bd = S.module('Bases de données');
    await addConfirmedSession(trx, bd, A.teacherDossou.id);
    await assertHttpError(
      structure.updateModule(A.rpBachelor, bd.id, { totalHours: 1.5 }, trx),
      400,
      'VALIDATION_ERROR',
    );
    const { module } = await structure.updateModule(A.rpBachelor, bd.id, { totalHours: 2 }, trx);
    assert.equal(module.totalHours, 2);
  });
});

test("refuse de supprimer un module qui a déjà des séances : l'historique est gardé", async () => {
  await withRollback(async (trx) => {
    const bd = S.module('Bases de données');
    await addConfirmedSession(trx, bd, A.teacherDossou.id);
    await assertHttpError(structure.deleteModule(A.rpBachelor, bd.id, trx), 409, 'MODULE_IN_USE');
  });
});

test('supprime un module sans séance ni note, avec ses affectations', async () => {
  await withRollback(async (trx) => {
    const java = S.module('Programmation avancée (Java)');
    await structure.deleteModule(A.rpBachelor, java.id, trx);
    assert.equal(await trx('modules').where({ id: java.id }).first(), undefined);
    assert.equal(await trx('teacher_assignments').where({ module_id: java.id }).first(), undefined);
  });
});

// --- Étudiants d'un module ---

test('le professeur affecté voit les étudiants de son module, page par page', async () => {
  const bd = S.module('Bases de données');
  const page1 = await structure.listModuleStudents(A.teacherDossou, bd.id, {
    page: 1,
    pageSize: 2,
  });
  assert.equal(page1.total, 4);
  assert.equal(page1.items.length, 2);
  assert.deepEqual(Object.keys(page1.items[0]).sort(), ['firstNames', 'id', 'lastName']);
});

test('un professeur non affecté au module ne voit pas ses étudiants', async () => {
  await assertHttpError(
    structure.listModuleStudents(A.teacherKpadonou, S.module('Bases de données').id, {
      page: 1,
      pageSize: 20,
    }),
    403,
    'FORBIDDEN',
  );
});
