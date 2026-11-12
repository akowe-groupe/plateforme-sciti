/**
 * @file Migration A-4 : schéma complet, ajouté aux tables de base de A-3.
 * Séances, présences, notes et leur historique, délégations de correction, canaux,
 * publications et notifications.
 * Règles de gestion : RG-12 à RG-17, RG-20 à RG-24, RG-28, RG-30 à RG-35, RG-14 et RG-36.
 *
 * Toutes les heures sont stockées en UTC (timestamptz). Les délais (plage de séance,
 * 15 minutes, 5 minutes) sont calculés par les services avec l'heure du serveur ; la base
 * garantit les valeurs possibles et la cohérence entre les colonnes.
 */

/** @param {import('knex').Knex} knex */
export async function up(knex) {
  await knex.raw(`
    -- Valeurs fixes (docs/api.md, § 0.6)
    CREATE TYPE session_status AS ENUM ('scheduled', 'moved', 'cancelled', 'confirmed');
    CREATE TYPE attendance_value AS ENUM ('P', 'A');                    -- RG-18
    CREATE TYPE grade_value AS ENUM ('A', 'B', 'F');                    -- RG-20
    CREATE TYPE grade_status AS ENUM ('entered', 'published');          -- RG-24
    CREATE TYPE delegation_type AS ENUM ('temporary', 'permanent');     -- RG-22
    CREATE TYPE channel_scope AS ENUM ('general', 'program', 'level');  -- RG-30
    CREATE TYPE notification_type AS ENUM ('SESSION_MOVED', 'SESSION_CANCELLED', 'YEAR_DECISION');

    -- ------------------------------------------------------------------
    -- Séances (RG-12, RG-13, RG-28)
    -- ------------------------------------------------------------------
    -- Une séance est un cours daté d'un module, avec un professeur.
    -- Le pointage de présence est validé une seule fois par séance :
    -- attendance_validated_at sert de point de départ aux 15 minutes de RG-16.
    CREATE TABLE sessions (
      id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      module_id               uuid NOT NULL REFERENCES modules(id) ON DELETE RESTRICT,
      teacher_id              uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      starts_at               timestamptz NOT NULL,
      ends_at                 timestamptz NOT NULL,
      status                  session_status NOT NULL DEFAULT 'scheduled',
      -- Rempli au premier déplacement : permet de revenir à « moved » si une
      -- confirmation est annulée par le RP (RG-28).
      moved_at                timestamptz,
      cancelled_at            timestamptz,
      cancel_reason           text,
      confirmed_at            timestamptz,
      confirmed_by            uuid REFERENCES users(id) ON DELETE RESTRICT,
      attendance_validated_at timestamptz,
      attendance_validated_by uuid REFERENCES users(id) ON DELETE RESTRICT,
      created_by              uuid REFERENCES users(id) ON DELETE RESTRICT,
      created_at              timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT sessions_end_after_start CHECK (ends_at > starts_at),
      -- Une séance ne dure pas plus d'une journée (évite une erreur de date à la saisie).
      CONSTRAINT sessions_max_duration CHECK (ends_at - starts_at <= interval '12 hours'),
      CONSTRAINT sessions_confirmed_fields CHECK (
        (status = 'confirmed') = (confirmed_at IS NOT NULL AND confirmed_by IS NOT NULL)
      ),
      CONSTRAINT sessions_cancelled_fields CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL)),
      CONSTRAINT sessions_moved_has_date CHECK (status <> 'moved' OR moved_at IS NOT NULL),
      CONSTRAINT sessions_validation_fields CHECK (
        (attendance_validated_at IS NULL) = (attendance_validated_by IS NULL)
      ),
      -- RG-28 : un cours annulé n'est jamais décompté, et on ne pointe pas une séance annulée.
      CONSTRAINT sessions_cancelled_not_validated CHECK (
        status <> 'cancelled' OR attendance_validated_at IS NULL
      )
    );
    CREATE INDEX sessions_module_time ON sessions (module_id, starts_at);
    CREATE INDEX sessions_teacher_time ON sessions (teacher_id, starts_at);

    -- ------------------------------------------------------------------
    -- Présences (RG-15 à RG-19)
    -- ------------------------------------------------------------------
    CREATE TABLE attendance_records (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id  uuid NOT NULL REFERENCES sessions(id) ON DELETE RESTRICT,
      student_id  uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      value       attendance_value NOT NULL,
      recorded_at timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz,
      UNIQUE (session_id, student_id)       -- un seul P ou A par étudiant et par séance
    );
    CREATE INDEX attendance_records_student ON attendance_records (student_id);

    -- ------------------------------------------------------------------
    -- Notes (RG-20 à RG-25)
    -- ------------------------------------------------------------------
    CREATE TABLE grades (
      id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id   uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      module_id    uuid NOT NULL REFERENCES modules(id) ON DELETE RESTRICT,
      value        grade_value NOT NULL,
      status       grade_status NOT NULL DEFAULT 'entered',
      entered_by   uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      entered_at   timestamptz NOT NULL DEFAULT now(),
      published_at timestamptz,
      published_by uuid REFERENCES users(id) ON DELETE RESTRICT,
      UNIQUE (student_id, module_id),       -- RG-20 : une seule note finale par module
      CONSTRAINT grades_published_fields CHECK (
        (status = 'published') = (published_at IS NOT NULL AND published_by IS NOT NULL)
      )
    );
    CREATE INDEX grades_module ON grades (module_id);

    -- RG-23 : trace de chaque correction. On n'efface jamais une ligne d'historique.
    CREATE TABLE grade_history (
      id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      grade_id   uuid NOT NULL REFERENCES grades(id) ON DELETE RESTRICT,
      old_value  grade_value NOT NULL,
      new_value  grade_value NOT NULL,
      author_id  uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      reason     text NOT NULL CHECK (length(trim(reason)) > 0),
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT grade_history_real_change CHECK (old_value <> new_value)
    );
    CREATE INDEX grade_history_grade ON grade_history (grade_id, created_at DESC);

    -- RG-22 : délégation du pouvoir de correction à un RP, temporaire ou durable.
    -- revoked_at : retrait anticipé par un directeur ; la ligne reste pour l'historique.
    CREATE TABLE grade_delegations (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      program_head_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      granted_by      uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      type            delegation_type NOT NULL,
      starts_at       timestamptz NOT NULL DEFAULT now(),
      ends_at         timestamptz,
      revoked_at      timestamptz,
      created_at      timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT delegations_temporary_has_end CHECK (type <> 'temporary' OR ends_at IS NOT NULL),
      CONSTRAINT delegations_permanent_no_end CHECK (type <> 'permanent' OR ends_at IS NULL),
      CONSTRAINT delegations_end_after_start CHECK (ends_at IS NULL OR ends_at > starts_at)
    );
    CREATE INDEX grade_delegations_head ON grade_delegations (program_head_id);

    -- ------------------------------------------------------------------
    -- Canaux et publications (RG-30 à RG-35)
    -- ------------------------------------------------------------------
    -- Un canal général, un canal par filière, un sous-canal par année.
    CREATE TABLE channels (
      id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      scope      channel_scope NOT NULL,
      program_id uuid REFERENCES programs(id) ON DELETE RESTRICT,
      level_id   uuid REFERENCES levels(id) ON DELETE RESTRICT,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT channels_scope_target CHECK (
        (scope = 'general' AND program_id IS NULL AND level_id IS NULL)
        OR (scope = 'program' AND program_id IS NOT NULL AND level_id IS NULL)
        OR (scope = 'level' AND program_id IS NULL AND level_id IS NOT NULL)
      )
    );
    CREATE UNIQUE INDEX channels_one_general ON channels (scope) WHERE scope = 'general';
    CREATE UNIQUE INDEX channels_one_per_program ON channels (program_id) WHERE scope = 'program';
    CREATE UNIQUE INDEX channels_one_per_level ON channels (level_id) WHERE scope = 'level';

    CREATE TABLE posts (
      id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE RESTRICT,
      author_id  uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      title      text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
      content    text NOT NULL CHECK (length(trim(content)) BETWEEN 1 AND 5000),
      created_at timestamptz NOT NULL DEFAULT now(),
      edited_at  timestamptz,                  -- RG-34 : non vide = mention « modifié »
      hidden_at  timestamptz,                  -- RG-35 : masquage
      hidden_by  uuid REFERENCES users(id) ON DELETE RESTRICT,
      CONSTRAINT posts_edited_after_creation CHECK (edited_at IS NULL OR edited_at >= created_at),
      CONSTRAINT posts_hidden_fields CHECK ((hidden_at IS NULL) = (hidden_by IS NULL))
    );
    CREATE INDEX posts_channel_time ON posts (channel_id, created_at DESC);

    -- ------------------------------------------------------------------
    -- Notifications (RG-14, RG-36), créées uniquement par le serveur
    -- ------------------------------------------------------------------
    CREATE TABLE notifications (
      id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      recipient_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      type         notification_type NOT NULL,
      content      text NOT NULL CHECK (length(trim(content)) > 0),
      session_id   uuid REFERENCES sessions(id) ON DELETE RESTRICT,
      read_at      timestamptz,
      created_at   timestamptz NOT NULL DEFAULT now(),
      -- Une notification de séance pointe toujours vers sa séance.
      CONSTRAINT notifications_session_link CHECK (
        (type IN ('SESSION_MOVED', 'SESSION_CANCELLED')) = (session_id IS NOT NULL)
      )
    );
    CREATE INDEX notifications_recipient_time ON notifications (recipient_id, created_at DESC);

    -- ------------------------------------------------------------------
    -- Canaux des filières et années déjà présentes (créées par A-3)
    -- ------------------------------------------------------------------
    INSERT INTO channels (scope) VALUES ('general');
    INSERT INTO channels (scope, program_id) SELECT 'program', id FROM programs;
    INSERT INTO channels (scope, level_id) SELECT 'level', id FROM levels;
  `);
}

/** @param {import('knex').Knex} knex */
export async function down(knex) {
  await knex.raw(`
    DROP TABLE IF EXISTS notifications;
    DROP TABLE IF EXISTS posts;
    DROP TABLE IF EXISTS channels;
    DROP TABLE IF EXISTS grade_delegations;
    DROP TABLE IF EXISTS grade_history;
    DROP TABLE IF EXISTS grades;
    DROP TABLE IF EXISTS attendance_records;
    DROP TABLE IF EXISTS sessions;
    DROP TYPE IF EXISTS notification_type;
    DROP TYPE IF EXISTS channel_scope;
    DROP TYPE IF EXISTS delegation_type;
    DROP TYPE IF EXISTS grade_status;
    DROP TYPE IF EXISTS grade_value;
    DROP TYPE IF EXISTS attendance_value;
    DROP TYPE IF EXISTS session_status;
  `);
}
