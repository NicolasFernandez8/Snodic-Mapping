-- Captación: etapas de contacto, seguimientos, puntaje, variantes A/B, casos de éxito, mini-auditorías y equipo.
-- Reversión: db/migrations/004_crm.down.sql
SET search_path TO mapping, public;

ALTER TABLE prospects
  ADD COLUMN stage text NOT NULL DEFAULT 'to_contact'
    CHECK (stage IN ('to_contact','contacted','replied','meeting','client','lost')),
  ADD COLUMN stage_changed_at timestamptz,
  ADD COLUMN contacted_at timestamptz,
  ADD COLUMN next_follow_up_at timestamptz,
  ADD COLUMN follow_ups_sent int NOT NULL DEFAULT 0,
  ADD COLUMN assigned_to int REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN score int,
  ADD COLUMN score_breakdown jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN message_variant text,
  ADD COLUMN audit_slug text UNIQUE,
  ADD COLUMN audit_views int NOT NULL DEFAULT 0,
  ADD COLUMN audit_last_viewed_at timestamptz;
CREATE INDEX prospects_stage_idx ON prospects (stage);
CREATE INDEX prospects_follow_up_idx ON prospects (next_follow_up_at) WHERE stage = 'contacted';
CREATE INDEX prospects_score_idx ON prospects (score DESC NULLS LAST);

-- Historial de cada prospecto (quién hizo qué y cuándo).
CREATE TABLE activities (
  id          bigserial PRIMARY KEY,
  prospect_id int NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  user_id     int REFERENCES users(id) ON DELETE SET NULL,
  kind        text NOT NULL CHECK (kind IN ('stage','note','message_sent','follow_up','assign','audit_created','audit_view')),
  from_stage  text,
  to_stage    text,
  body        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activities_prospect_idx ON activities (prospect_id, created_at DESC);

-- Variantes del mensaje (A/B). Se agregan como indicación extra al prompt del Agente 3.
CREATE TABLE message_variants (
  key          text PRIMARY KEY,
  label        text NOT NULL,
  instructions text NOT NULL DEFAULT '',
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);
INSERT INTO message_variants (key, label, instructions) VALUES
('A', 'Original', ''),
('B', 'Reservas directas', 'En [BENEFICIO EN 1 LÍNEA] enfocá el beneficio en conseguir más reservas directas y depender menos de las comisiones de plataformas.'),
('C', 'Tiempo del equipo', 'En [BENEFICIO EN 1 LÍNEA] enfocá el beneficio en que el equipo pierda menos tiempo respondiendo lo mismo y atienda mejor a los huéspedes.');
ALTER TABLE outputs ADD COLUMN variant text;

-- Casos de éxito para reutilizar en seguimientos.
CREATE TABLE case_studies (
  id         serial PRIMARY KEY,
  title      text NOT NULL,
  tags       text[] NOT NULL DEFAULT '{}',   -- palabras del problema: reservas, teléfono, check-in…
  summary    text NOT NULL,
  result     text,
  link       text,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO settings (key, value) VALUES
('follow_up_days', '3'),
('follow_up_max', '2'),
('contact_whatsapp', '""')
ON CONFLICT (key) DO NOTHING;
