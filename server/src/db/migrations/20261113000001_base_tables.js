/**
 * @file Migration A-3 : tables de base de la plateforme.
 * Structure académique (filières, années, semestres, modules), utilisateurs, inscriptions des
 * étudiants et affectations des professeurs.
 * Règles de gestion : RG-02, RG-03, RG-04, RG-09, RG-10, RG-11, RG-26.
 *
 * Les tables du fonctionnement quotidien (séances, présences, notes, historique, délégations,
 * canaux, publications, notifications) arrivent avec la migration complète de A-4.
 *
 * Le SQL est écrit en clair pour être relu facilement par T et C. Les contraintes (CHECK,
 * UNIQUE, ENUM, clés étrangères) sont le dernier rempart : même si un service oublie une
 * vérification, la base refuse la donnée invalide (règle technique n° 5 du guide).
 */

/** @param {import('knex').Knex} knex */
export async function up(knex) {
  await knex.raw(`
    -- Rôles (voir docs/api.md, § 0.6). Le super étudiant est un étudiant avec
    -- is_super_student = true : ce n'est pas un rôle à part (section 3 du cahier des charges).
    CREATE TYPE user_role AS ENUM ('director', 'programHead', 'assistant', 'teacher', 'student');

    -- Statut d'une inscription (RG-11, RG-36) : en cours, passé ou redoublant.
    CREATE TYPE enrollment_status AS ENUM ('ongoing', 'promoted', 'repeating');

    -- RG-09 : une filière (Bachelor, Master...). Ajouter une filière = ajouter une ligne.
    CREATE TABLE programs (
      id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name           text NOT NULL UNIQUE CHECK (length(trim(name)) > 0),
      duration_years smallint NOT NULL CHECK (duration_years BETWEEN 1 AND 8),
      created_at     timestamptz NOT NULL DEFAULT now()
    );

    -- RG-09 : une année d'une filière pour une cohorte (ex. Bachelor, 2e année, cohorte 2025).
    -- Ajouter une cohorte ou un niveau = ajouter une ligne, sans toucher au schéma.
    CREATE TABLE levels (
      id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      program_id uuid NOT NULL REFERENCES programs(id) ON DELETE RESTRICT,
      number     smallint NOT NULL CHECK (number >= 1),
      cohort     text NOT NULL CHECK (length(trim(cohort)) > 0),
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (program_id, number, cohort)
    );

    -- RG-09 : deux semestres par année. RG-26 : un seul semestre « en cours » par année.
    CREATE TABLE semesters (
      id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      level_id  uuid NOT NULL REFERENCES levels(id) ON DELETE RESTRICT,
      number    smallint NOT NULL CHECK (number IN (1, 2)),
      is_active boolean NOT NULL DEFAULT false,
      UNIQUE (level_id, number)
    );
    -- Index partiel : au plus une ligne is_active = true pour une même année.
    CREATE UNIQUE INDEX semesters_one_active_per_level ON semesters (level_id) WHERE is_active;

    -- RG-26 : module d'un semestre avec son volume horaire total.
    -- numeric(6,2) accepte les demi-heures (séance de 1 h 30).
    CREATE TABLE modules (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      semester_id uuid NOT NULL REFERENCES semesters(id) ON DELETE RESTRICT,
      name        text NOT NULL CHECK (length(trim(name)) > 0),
      total_hours numeric(6,2) NOT NULL CHECK (total_hours > 0),
      created_at  timestamptz NOT NULL DEFAULT now(),
      UNIQUE (semester_id, name)
    );

    -- Tous les comptes. Un professeur présent dans plusieurs filières a UN seul compte
    -- (RG-04) : ses filières viennent de ses affectations (teacher_assignments).
    CREATE TABLE users (
      id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      last_name            text NOT NULL CHECK (length(trim(last_name)) > 0),
      first_names          text NOT NULL CHECK (length(trim(first_names)) > 0),
      email                text NOT NULL CHECK (position('@' IN email) > 1),
      phone                text,
      password_hash        text NOT NULL,
      must_change_password boolean NOT NULL DEFAULT true,            -- RG-06
      role                 user_role NOT NULL,
      -- Filière gérée : obligatoire pour un RP ou un adjoint (RG-10), vide pour les autres.
      program_id           uuid REFERENCES programs(id) ON DELETE RESTRICT,
      is_super_student     boolean NOT NULL DEFAULT false,
      -- Code administrateur haché (RG-07), rempli par la tâche C-6.
      admin_code_hash      text,
      is_active            boolean NOT NULL DEFAULT true,
      created_at           timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT users_program_for_managers CHECK (
        (role IN ('programHead', 'assistant') AND program_id IS NOT NULL)
        OR (role NOT IN ('programHead', 'assistant') AND program_id IS NULL)
      ),
      CONSTRAINT users_super_student_is_student CHECK (is_super_student = false OR role = 'student')
    );
    -- Une adresse e-mail ne sert qu'à un seul compte, sans tenir compte des majuscules.
    CREATE UNIQUE INDEX users_email_unique ON users (lower(email));

    -- RG-11 : inscription d'un étudiant dans une année. Les anciennes inscriptions sont
    -- gardées (historique, RG-38) : un passage d'année ajoute une ligne.
    CREATE TABLE enrollments (
      id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      level_id   uuid NOT NULL REFERENCES levels(id) ON DELETE RESTRICT,
      status     enrollment_status NOT NULL DEFAULT 'ongoing',
      created_at timestamptz NOT NULL DEFAULT now(),
      closed_at  timestamptz,
      UNIQUE (student_id, level_id),
      CONSTRAINT enrollments_closed_when_finished CHECK ((status = 'ongoing') = (closed_at IS NULL))
    );
    -- Un étudiant n'a qu'une seule inscription en cours à la fois.
    CREATE UNIQUE INDEX enrollments_one_ongoing ON enrollments (student_id) WHERE status = 'ongoing';
    CREATE INDEX enrollments_level ON enrollments (level_id);

    -- RG-03, RG-04 : affectation d'un professeur à un module. La filière et l'année se
    -- retrouvent par le module (module -> semestre -> année -> filière), sans les recopier.
    CREATE TABLE teacher_assignments (
      id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      teacher_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      module_id  uuid NOT NULL REFERENCES modules(id) ON DELETE RESTRICT,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (teacher_id, module_id)
    );
    CREATE INDEX teacher_assignments_module ON teacher_assignments (module_id);
  `);
}

/** @param {import('knex').Knex} knex */
export async function down(knex) {
  await knex.raw(`
    DROP TABLE IF EXISTS teacher_assignments;
    DROP TABLE IF EXISTS enrollments;
    DROP TABLE IF EXISTS users;
    DROP TABLE IF EXISTS modules;
    DROP TABLE IF EXISTS semesters;
    DROP TABLE IF EXISTS levels;
    DROP TABLE IF EXISTS programs;
    DROP TYPE IF EXISTS enrollment_status;
    DROP TYPE IF EXISTS user_role;
  `);
}
