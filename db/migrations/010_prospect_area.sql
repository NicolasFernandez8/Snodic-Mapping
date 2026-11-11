-- Barrio del prospecto (desde OpenStreetMap / Nominatim a partir de sus coordenadas).
-- NULL = todavía no se buscó; '' = se buscó y no hay barrio.
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS area text;
CREATE INDEX IF NOT EXISTS prospects_area_pending_idx ON prospects (id) WHERE area IS NULL AND lat IS NOT NULL;
