-- Filtros de búsqueda: estrellas, cadena/independiente, problemas detectados y búsquedas guardadas.
-- Reversión: db/migrations/006_filters.down.sql
SET search_path TO mapping, public;

ALTER TABLE prospects
  ADD COLUMN stars int CHECK (stars BETWEEN 1 AND 5),
  ADD COLUMN brand text,                       -- cadena (etiqueta brand/operator de OSM o carga manual)
  ADD COLUMN pain_tags text[] NOT NULL DEFAULT '{}';
CREATE INDEX prospects_pain_tags_idx ON prospects USING gin (pain_tags);

-- Datos que ya trajo OSM y estaban guardados en "raw".
UPDATE prospects
SET stars = NULLIF(substring(raw->'tags'->>'stars' FROM '^[1-5]'), '')::int,
    brand = COALESCE(raw->'tags'->>'brand', CASE WHEN raw->'tags' ? 'brand:wikidata' THEN 'cadena' END)
WHERE source = 'osm' AND raw ? 'tags';

CREATE TABLE saved_searches (
  id         serial PRIMARY KEY,
  name       text NOT NULL,
  filters    jsonb NOT NULL,
  created_by int REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
