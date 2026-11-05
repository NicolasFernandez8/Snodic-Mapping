-- Mapeos programados (calendario): una vez en una fecha/hora o semanal en días y horario elegidos.
-- Reversión: db/migrations/007_schedules.down.sql
SET search_path TO mapping, public;

CREATE TABLE schedules (
  id           serial PRIMARY KEY,
  name         text NOT NULL,
  kind         text NOT NULL CHECK (kind IN ('once','weekly')),
  job_type     text NOT NULL DEFAULT 'map_localities' CHECK (job_type IN ('map_localities','daily_pipeline')),
  quota        int  NOT NULL DEFAULT 3 CHECK (quota BETWEEN 1 AND 50),
  run_at       timestamptz,                 -- 'once'
  weekdays     int[] NOT NULL DEFAULT '{}', -- 'weekly': 0 = domingo … 6 = sábado
  time_of_day  text,                        -- 'weekly': HH:MM (hora de TZ)
  tz           text NOT NULL DEFAULT 'Europe/Madrid',
  active       boolean NOT NULL DEFAULT true,
  next_run_at  timestamptz,
  last_run_at  timestamptz,
  last_job_id  bigint,
  created_by   int REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (kind <> 'once' OR run_at IS NOT NULL),
  CHECK (kind <> 'weekly' OR (cardinality(weekdays) > 0 AND time_of_day ~ '^\d{2}:\d{2}$'))
);
CREATE INDEX schedules_due_idx ON schedules (next_run_at) WHERE active;
