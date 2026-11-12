/**
 * @file Données de démonstration de base (A-3). Toutes les personnes sont FICTIVES :
 * aucune donnée réelle d'étudiant ne doit entrer dans le dépôt.
 * Les adresses utilisent le domaine réservé .test, qui ne peut recevoir aucun e-mail.
 *
 * Lancement : npm run seed (efface puis recrée toutes les données de démonstration).
 * Le jeu étendu (2 filières complètes, séances, notes...) arrive avec A-8.
 */
import bcrypt from 'bcryptjs';

/** @param {import('knex').Knex} knex */
export async function seed(knex) {
  const demoPassword = process.env.SEED_DEMO_PASSWORD;
  if (!demoPassword) {
    throw new Error('SEED_DEMO_PASSWORD manque dans le fichier .env (voir .env.example).');
  }
  // Provisoire : bcrypt en attendant le choix définitif de C (tâche C-2).
  const passwordHash = await bcrypt.hash(demoPassword, 10);

  // On vide les tables dans l'ordre inverse des clés étrangères.
  await knex('teacher_assignments').del();
  await knex('enrollments').del();
  await knex('users').del();
  await knex('modules').del();
  await knex('semesters').del();
  await knex('levels').del();
  await knex('programs').del();

  // --- Structure académique (RG-09) ---
  const [bachelor, master] = await knex('programs')
    .insert([
      // Durée de 4 ans : le RP du Bachelor « gère les 4 années » (RG-10).
      { name: 'Bachelor en Digitalisation et Science des données', duration_years: 4 },
      { name: 'Master en ingénierie de conception durable', duration_years: 2 },
    ])
    .returning('*');

  const [bachelor1, bachelor2, master1] = await knex('levels')
    .insert([
      { program_id: bachelor.id, number: 1, cohort: '2026' },
      { program_id: bachelor.id, number: 2, cohort: '2025' },
      { program_id: master.id, number: 1, cohort: '2026' },
    ])
    .returning('*');

  // Deux semestres par année, le semestre 1 en cours (RG-26).
  const semesterRows = [bachelor1, bachelor2, master1].flatMap((level) => [
    { level_id: level.id, number: 1, is_active: true },
    { level_id: level.id, number: 2, is_active: false },
  ]);
  const semesters = await knex('semesters').insert(semesterRows).returning('*');
  const semesterOf = (level, number) =>
    semesters.find((s) => s.level_id === level.id && s.number === number);

  const modules = await knex('modules')
    .insert([
      { semester_id: semesterOf(bachelor1, 1).id, name: 'Algorithmique', total_hours: 30 },
      {
        semester_id: semesterOf(bachelor1, 1).id,
        name: 'Statistiques descriptives',
        total_hours: 24,
      },
      {
        semester_id: semesterOf(bachelor2, 1).id,
        name: 'Programmation avancée (Java)',
        total_hours: 30,
      },
      { semester_id: semesterOf(bachelor2, 1).id, name: 'Bases de données', total_hours: 30 },
      {
        semester_id: semesterOf(bachelor2, 1).id,
        name: 'Protection des données personnelles',
        total_hours: 20,
      },
      { semester_id: semesterOf(bachelor2, 2).id, name: 'Développement web', total_hours: 30 },
      { semester_id: semesterOf(master1, 1).id, name: 'Éco-conception', total_hours: 30 },
      { semester_id: semesterOf(master1, 1).id, name: 'Analyse du cycle de vie', total_hours: 24 },
    ])
    .returning('*');
  const moduleNamed = (name) => modules.find((m) => m.name === name);

  // --- Comptes (tous fictifs) ---
  let phoneCounter = 0;
  /** Construit une ligne users avec les valeurs communes. */
  const person = (lastName, firstNames, role, extra = {}) => {
    phoneCounter += 1;
    const slug = `${firstNames.split(' ')[0]}.${lastName}`
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
    return {
      last_name: lastName,
      first_names: firstNames,
      email: `${slug}@demo.sciti.test`,
      phone: `+229 01 00 00 ${String(phoneCounter).padStart(2, '0')}`,
      password_hash: passwordHash,
      must_change_password: false,
      role,
      ...extra,
    };
  };

  const staff = await knex('users')
    .insert([
      person('ADJOVI', 'Marc', 'director'),
      person('TOSSOU', 'Clarisse', 'director'),
      person('HOUNKPATIN', 'Sylvie', 'programHead', { program_id: bachelor.id }),
      person('AGBO', 'Rodrigue', 'programHead', { program_id: master.id }),
      person('DEGBO', 'Fabrice', 'assistant', { program_id: bachelor.id }),
      person('DOSSOU', 'Paul', 'teacher'),
      person('KPADONOU', 'Aline', 'teacher'),
      person('SOGLO', 'Hervé', 'teacher'),
    ])
    .returning('*');
  const staffNamed = (lastName) => staff.find((u) => u.last_name === lastName);

  // RG-04 : DOSSOU Paul intervient dans les deux filières avec un seul compte.
  await knex('teacher_assignments').insert([
    { teacher_id: staffNamed('DOSSOU').id, module_id: moduleNamed('Bases de données').id },
    { teacher_id: staffNamed('DOSSOU').id, module_id: moduleNamed('Analyse du cycle de vie').id },
    {
      teacher_id: staffNamed('KPADONOU').id,
      module_id: moduleNamed('Programmation avancée (Java)').id,
    },
    { teacher_id: staffNamed('KPADONOU').id, module_id: moduleNamed('Algorithmique').id },
    {
      teacher_id: staffNamed('SOGLO').id,
      module_id: moduleNamed('Protection des données personnelles').id,
    },
    { teacher_id: staffNamed('SOGLO').id, module_id: moduleNamed('Statistiques descriptives').id },
    { teacher_id: staffNamed('SOGLO').id, module_id: moduleNamed('Développement web').id },
    { teacher_id: staffNamed('SOGLO').id, module_id: moduleNamed('Éco-conception').id },
  ]);

  const studentsByLevel = [
    {
      level: bachelor2,
      people: [
        person('AHOUANSOU', 'Kévin', 'student', { is_super_student: true }),
        person('GBAGUIDI', 'Estelle', 'student'),
        person('ZINSOU', 'Romaric', 'student'),
        // Garde le mot de passe temporaire : sert à tester le premier changement (E1).
        person('HOUNGBO', 'Nadège', 'student', { must_change_password: true }),
      ],
    },
    {
      level: bachelor1,
      people: [
        person('ASSOGBA', 'Prince', 'student'),
        person('KOUDJO', 'Mariette', 'student'),
        person('SANNI', 'Ibrahim', 'student'),
      ],
    },
    {
      level: master1,
      people: [person('AKPLOGAN', 'Ruth', 'student'), person('VODOUNON', 'Serge', 'student')],
    },
  ];

  for (const { level, people } of studentsByLevel) {
    const students = await knex('users').insert(people).returning('id');
    await knex('enrollments').insert(
      students.map((s) => ({ student_id: s.id, level_id: level.id, status: 'ongoing' })),
    );
  }
}
