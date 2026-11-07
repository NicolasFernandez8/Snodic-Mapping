-- Agentes 6 a 12 y mejoras: tipo de teléfono, aperturas nuevas, Wikidata, feriados y borradores de casos.
-- Reversión: db/migrations/009_agents_plus.down.sql
SET search_path TO mapping, public;

ALTER TABLE prospects
  ADD COLUMN phone_type text NOT NULL DEFAULT 'unknown' CHECK (phone_type IN ('mobile','landline','unknown')),
  ADD COLUMN is_new_opening boolean NOT NULL DEFAULT false,
  ADD COLUMN wikidata_id text,
  ADD COLUMN enriched_at timestamptz,
  ADD COLUMN reactivated_at timestamptz;
CREATE INDEX prospects_phone_type_idx ON prospects (phone_type);

-- Clasificación inicial del teléfono (España: 6/7 = móvil, 8/9 = fijo).
UPDATE prospects SET phone_type = CASE
  WHEN phone IS NULL THEN 'unknown'
  WHEN regexp_replace(regexp_replace(phone, '\D', '', 'g'), '^(00)?34', '') ~ '^[67]\d{8}$' THEN 'mobile'
  WHEN regexp_replace(regexp_replace(phone, '\D', '', 'g'), '^(00)?34', '') ~ '^[89]\d{8}$' THEN 'landline'
  ELSE 'unknown' END;

-- Feriados y fechas de temporada (caché de la API pública Nager.Date + fechas locales de Alicante).
CREATE TABLE season_dates (
  day     date NOT NULL,
  name    text NOT NULL,
  kind    text NOT NULL CHECK (kind IN ('holiday','event','season')),
  source  text NOT NULL DEFAULT 'manual',
  PRIMARY KEY (day, name)
);

-- Borradores de casos de éxito generados al cerrar un cliente.
ALTER TABLE case_studies
  ADD COLUMN draft boolean NOT NULL DEFAULT false,
  ADD COLUMN prospect_id int REFERENCES prospects(id) ON DELETE SET NULL;

INSERT INTO settings (key, value) VALUES
  ('daily_digest_size', '10'),
  ('reactivate_after_days', '75'),
  ('watch_openings_days', '30')
ON CONFLICT (key) DO NOTHING;

-- Variante del mensaje pensada para antes de la temporada alta (inactiva hasta que se active).
INSERT INTO message_variants (key, label, instructions, active) VALUES
  ('T', 'Antes de temporada alta',
   'En [BENEFICIO EN 1 LÍNEA] mencioná que conviene resolverlo antes de la temporada alta para no perder reservas en las semanas de más demanda.',
   false)
ON CONFLICT (key) DO NOTHING;
