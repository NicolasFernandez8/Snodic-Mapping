-- Rendimiento y calidad de datos: geometría simplificada, lista "no contactar", caché de Overpass e índices.
-- Reversión: db/migrations/005_perf_quality.down.sql
SET search_path TO mapping, public;

-- Polígonos simplificados para el mapa (los completos se siguen usando para punto-en-polígono).
ALTER TABLE localities ADD COLUMN boundary_simple jsonb;

-- Lista "no contactar" (RGPD): bloquea por teléfono o por nombre+localidad, aunque reaparezca al mapear.
CREATE TABLE do_not_contact (
  id          serial PRIMARY KEY,
  phone       text,          -- solo dígitos, con prefijo 34
  name_key    text,          -- nombre normalizado
  reason      text,
  created_by  int REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dnc_phone_idx ON do_not_contact (phone) WHERE phone IS NOT NULL;
CREATE INDEX dnc_name_idx ON do_not_contact (name_key) WHERE name_key IS NOT NULL;
ALTER TABLE prospects ADD COLUMN do_not_contact boolean NOT NULL DEFAULT false;
ALTER TABLE prospects ADD COLUMN duplicate_of int REFERENCES prospects(id) ON DELETE SET NULL;

-- Caché de respuestas de Overpass (evita repetir consultas pesadas).
CREATE TABLE overpass_cache (
  query_hash text PRIMARY KEY,
  response   jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

-- Índices para métricas, filtros y pipeline.
CREATE INDEX activities_kind_idx ON activities (kind, created_at);
CREATE INDEX prospects_assigned_idx ON prospects (assigned_to);
CREATE INDEX prospects_stage_score_idx ON prospects (stage, score DESC NULLS LAST);
CREATE INDEX prospects_phone_idx ON prospects (phone) WHERE phone IS NOT NULL;
