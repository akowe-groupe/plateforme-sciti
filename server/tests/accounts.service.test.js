/**
 * Tests du service des comptes (A-5) : RG-01 à RG-06, RG-10, RG-31.
 * Chaque test travaille dans une transaction annulée : les données de démo ne bougent pas.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/db/knex.js';
import * as accounts from '../src/services/accounts.service.js';
import { verifyPassword } from '../src/services/password.service.js';
import { withRollback } from './helpers/db.js';
import { loadActors, loadStructure } from './helpers/actors.js';

let A;
let S;

before(async () => {
  A = await loadActors();
  S = await loadStructure();
});

after(async () => {
  await db.destroy();
});

async function assertHttpError(promise, status, code) {
  await assert.rejects(promise, (err) => {
    assert.equal(err.status, status);
    assert.equal(err.code, code);
    return true;
  });
}

const newPerson = (suffix) => ({
  lastName: 'TESTEUR',
  firstNames: `Fictif ${suffix}`,
  email: `fictif.${suffix}@demo.sciti.test`,
  phone: '+229 01 00 00 99',
});

// --- Étudiants (RG-01, RG-02, RG-06) ---

test("le RP crée un étudiant : inscrit dans l'année, mot de passe temporaire à changer", async () => {
  await withRollback(async (trx) => {
    const levelId = S.level(S.bachelor, 1).id;
    const result = await accounts.createStudent(
      A.rpBachelor,
      { ...newPerson('etu1'), levelId },
      trx,
    );
    assert.equal(result.user.role, 'student');
    assert.equal(result.user.mustChangePassword, true);
    assert.match(result.temporaryPassword, /^\S{3}-\S{4}-\S{3}$/);

    const row = await trx('users').where({ id: result.user.id }).first();
    assert.equal(await verifyPassword(result.temporaryPassword, row.password_hash), true);
    const enrollment = await trx('enrollments').where({ student_id: row.id }).first();
    assert.equal(enrollment.level_id, levelId);
    assert.equal(enrollment.status, 'ongoing');
  });
});

test("le RP du Master ne peut pas créer d'étudiant dans le Bachelor (RG-10)", async () => {
  await withRollback(async (trx) => {
    await assertHttpError(
      accounts.createStudent(
        A.rpMaster,
        { ...newPerson('etu2'), levelId: S.level(S.bachelor, 1).id },
        trx,
      ),
      403,
      'FORBIDDEN',
    );
  });
});

test('un professeur ne peut pas créer de compte (RG-01)', async () => {
  await withRollback(async (trx) => {
    await assertHttpError(
      accounts.createStudent(
        A.teacherDossou,
        { ...newPerson('etu3'), levelId: S.level(S.bachelor, 2).id },
        trx,
      ),
      403,
      'FORBIDDEN',
    );
  });
});

test('refuse une adresse e-mail déjà utilisée', async () => {
  await withRollback(async (trx) => {
    await assertHttpError(
      accounts.createStudent(
        A.rpBachelor,
        {
          ...newPerson('etu4'),
          email: 'kevin.ahouansou@demo.sciti.test',
          levelId: S.level(S.bachelor, 1).id,
        },
        trx,
      ),
      409,
      'EMAIL_ALREADY_USED',
    );
  });
});

// --- Professeurs et comptes liés (RG-03, RG-04) ---

test('le RP crée un nouveau professeur affecté à un module de sa filière', async () => {
  await withRollback(async (trx) => {
    const result = await accounts.createTeacher(
      A.rpBachelor,
      { ...newPerson('prof1'), moduleIds: [S.module('Bases de données').id] },
      trx,
    );
    assert.equal(result.linked, false);
    assert.ok(result.temporaryPassword);
    assert.equal(result.assignments.length, 1);
    assert.equal(result.assignments[0].programId, S.bachelor.id);
  });
});

test("refuse d'affecter un professeur à un module d'une autre filière", async () => {
  await withRollback(async (trx) => {
    await assertHttpError(
      accounts.createTeacher(
        A.rpBachelor,
        { ...newPerson('prof2'), moduleIds: [S.module('Éco-conception').id] },
        trx,
      ),
      403,
      'FORBIDDEN',
    );
  });
});

test('le RP du Master lie une professeure du Bachelor : une seule personne, deux filières (RG-04)', async () => {
  await withRollback(async (trx) => {
    const result = await accounts.createTeacher(
      A.rpMaster,
      { existingTeacherId: A.teacherKpadonou.id, moduleIds: [S.module('Éco-conception').id] },
      trx,
    );
    assert.equal(result.linked, true);
    assert.equal(result.temporaryPassword, null); // elle garde son mot de passe

    const found = await accounts.searchTeachers(A.rpMaster, { lastName: 'kpadonou' }, trx);
    assert.equal(found.items.length, 1);
    assert.equal(found.items[0].programs.length, 2);
  });
});

test('refuse une affectation en double', async () => {
  await withRollback(async (trx) => {
    await assertHttpError(
      accounts.addAssignment(
        A.rpBachelor,
        A.teacherDossou.id,
        S.module('Bases de données').id,
        trx,
      ),
      409,
      'ALREADY_ASSIGNED',
    );
  });
});

test('la recherche de professeurs ne montre ni e-mail ni téléphone', async () => {
  const found = await accounts.searchTeachers(A.rpBachelor, { lastName: 'dos' });
  assert.equal(found.items.length, 1);
  assert.deepEqual(Object.keys(found.items[0]).sort(), [
    'firstNames',
    'id',
    'lastName',
    'programs',
  ]);
});

test('refuse de retirer une affectation utilisée par une séance à venir', async () => {
  await withRollback(async (trx) => {
    const bd = S.module('Bases de données');
    const assignment = await trx('teacher_assignments')
      .where({ teacher_id: A.teacherDossou.id, module_id: bd.id })
      .first();
    await trx('sessions').insert({
      module_id: bd.id,
      teacher_id: A.teacherDossou.id,
      starts_at: '2030-01-07T07:00:00Z',
      ends_at: '2030-01-07T09:00:00Z',
    });
    await assertHttpError(
      accounts.removeAssignment(A.rpBachelor, A.teacherDossou.id, assignment.id, trx),
      409,
      'ASSIGNMENT_IN_USE',
    );
  });
});

test('retire une affectation sans séance à venir', async () => {
  await withRollback(async (trx) => {
    const java = S.module('Programmation avancée (Java)');
    const assignment = await trx('teacher_assignments')
      .where({ teacher_id: A.teacherKpadonou.id, module_id: java.id })
      .first();
    await accounts.removeAssignment(A.rpBachelor, A.teacherKpadonou.id, assignment.id, trx);
    assert.equal(await trx('teacher_assignments').where({ id: assignment.id }).first(), undefined);
  });
});

// --- RP et adjoints (RG-05, RG-07) ---

test('le directeur crée un RP : mot de passe temporaire et code administrateur affichés une fois', async () => {
  await withRollback(async (trx) => {
    const result = await accounts.createManager(
      A.director,
      'programHead',
      { ...newPerson('rp1'), programId: S.master.id },
      trx,
    );
    assert.equal(result.user.role, 'programHead');
    assert.match(result.adminCode, /^RP-[A-Z2-9]{4}-[A-Z2-9]{2}$/);
    const row = await trx('users').where({ id: result.user.id }).first();
    assert.equal(await verifyPassword(result.adminCode, row.admin_code_hash), true);
  });
});

test('un RP ne peut pas créer de RP', async () => {
  await withRollback(async (trx) => {
    await assertHttpError(
      accounts.createManager(
        A.rpBachelor,
        'programHead',
        { ...newPerson('rp2'), programId: S.bachelor.id },
        trx,
      ),
      403,
      'FORBIDDEN',
    );
  });
});

test('le RP nomme un adjoint dans sa filière, pas dans une autre', async () => {
  await withRollback(async (trx) => {
    const ok = await accounts.createManager(
      A.rpBachelor,
      'assistant',
      { ...newPerson('ad1'), programId: S.bachelor.id },
      trx,
    );
    assert.match(ok.adminCode, /^AD-/);
    await assertHttpError(
      accounts.createManager(
        A.rpBachelor,
        'assistant',
        { ...newPerson('ad2'), programId: S.master.id },
        trx,
      ),
      403,
      'FORBIDDEN',
    );
  });
});

test("un adjoint ne peut pas nommer d'adjoint (RG-05)", async () => {
  await withRollback(async (trx) => {
    await assertHttpError(
      accounts.createManager(
        A.assistantBachelor,
        'assistant',
        { ...newPerson('ad3'), programId: S.bachelor.id },
        trx,
      ),
      403,
      'FORBIDDEN',
    );
  });
});

// --- Super étudiant (RG-31) ---

test("le RP nomme un super étudiant de sa filière, pas celui d'une autre", async () => {
  await withRollback(async (trx) => {
    const estelle = await trx('users').where({ email: 'estelle.gbaguidi@demo.sciti.test' }).first();
    const { user } = await accounts.setSuperStudent(A.rpBachelor, estelle.id, true, trx);
    assert.equal(user.isSuperStudent, true);
    await assertHttpError(
      accounts.setSuperStudent(A.rpBachelor, A.studentM1.id, true, trx),
      403,
      'FORBIDDEN',
    );
  });
});

// --- Mot de passe oublié (R12) ---

test('réinitialiser un mot de passe oblige à le changer à la prochaine connexion', async () => {
  await withRollback(async (trx) => {
    const { temporaryPassword } = await accounts.resetPassword(A.rpBachelor, A.studentB2.id, trx);
    const row = await trx('users').where({ id: A.studentB2.id }).first();
    assert.equal(row.must_change_password, true);
    assert.equal(await verifyPassword(temporaryPassword, row.password_hash), true);
  });
});

test("un RP ne peut réinitialiser ni un directeur, ni un étudiant d'une autre filière", async () => {
  await withRollback(async (trx) => {
    await assertHttpError(
      accounts.resetPassword(A.rpBachelor, A.director.id, trx),
      403,
      'FORBIDDEN',
    );
    await assertHttpError(
      accounts.resetPassword(A.rpBachelor, A.studentM1.id, trx),
      403,
      'FORBIDDEN',
    );
  });
});

// --- Liste des comptes (RG-10) ---

const page = { page: 1, pageSize: 100 };

test('le RP du Bachelor voit ses étudiants et ses professeurs, pas ceux du Master seul', async () => {
  const { items } = await accounts.listAccounts(A.rpBachelor, page);
  const ids = items.map((u) => u.id);
  assert.ok(ids.includes(A.studentB2.id));
  assert.ok(ids.includes(A.teacherDossou.id)); // professeur dans les deux filières
  assert.ok(!ids.includes(A.studentM1.id));
  assert.ok(!ids.includes(A.rpMaster.id));

  const students = await accounts.listAccounts(A.rpBachelor, { ...page, role: 'student' });
  assert.equal(students.total, 7); // 3 en 1re année + 4 en 2e année
});

test('filtres : recherche par nom et par année', async () => {
  const search = await accounts.listAccounts(A.director, { ...page, search: 'zinsou' });
  assert.equal(search.total, 1);
  const level = await accounts.listAccounts(A.director, {
    ...page,
    levelId: S.level(S.master, 1).id,
  });
  assert.equal(level.total, 2);
});

test('un RP ne peut pas lister une autre filière ; un professeur ne liste rien', async () => {
  await assertHttpError(
    accounts.listAccounts(A.rpBachelor, { ...page, programId: S.master.id }),
    403,
    'FORBIDDEN',
  );
  await assertHttpError(accounts.listAccounts(A.teacherDossou, page), 403, 'FORBIDDEN');
});
