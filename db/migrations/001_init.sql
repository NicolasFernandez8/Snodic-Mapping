-- Snodic-Mapping: esquema inicial.
-- Vive en el esquema "mapping" para no mezclarse con otras tablas de la base "snodic".
-- Reversión: ver db/migrations/001_init.down.sql

CREATE SCHEMA IF NOT EXISTS mapping;
SET search_path TO mapping, public;

-- Rubros (nichos) configurables para el automapeo.
CREATE TABLE niches (
  key           text PRIMARY KEY,
  label         text NOT NULL,
  google_types  text[] NOT NULL DEFAULT '{}',   -- includedType de Places API (New)
  keywords      text[] NOT NULL DEFAULT '{}',   -- textQuery de Places API
  osm_tags      jsonb  NOT NULL DEFAULT '[]',   -- [{"k":"tourism","v":"hotel"}]
  business_label text NOT NULL DEFAULT 'negocios', -- se usa en el mensaje: "Estoy trabajando ahora con algunos ..."
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Regiones grandes (provincias) que se recorren localidad por localidad.
CREATE TABLE regions (
  id            serial PRIMARY KEY,
  name          text NOT NULL,
  country_code  text NOT NULL DEFAULT 'ES',
  osm_relation_id bigint UNIQUE,
  admin_level   int  NOT NULL DEFAULT 8,          -- nivel administrativo de sus localidades
  origin_lat    double precision,                 -- punto desde el que se expande el mapeo
  origin_lng    double precision,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('queued','active','done','paused')),
  position      int  NOT NULL DEFAULT 0,          -- orden de recorrido entre regiones
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Localidades / sectores (municipios o barrios).
CREATE TABLE localities (
  id            serial PRIMARY KEY,
  region_id     int NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  parent_id     int REFERENCES localities(id) ON DELETE CASCADE,
  name          text NOT NULL,
  osm_id        text,                              -- "relation/12345"
  admin_level   int,
  boundary      jsonb,                             -- GeoJSON Polygon/MultiPolygon
  bbox          double precision[4],               -- [minLng, minLat, maxLng, maxLat]
  centroid_lat  double precision,
  centroid_lng  double precision,
  distance_km   double precision,                  -- distancia al origen de la región
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','mapping','mapped','failed','skipped')),
  last_error    text,
  prospects_found int NOT NULL DEFAULT 0,
  mapped_at     timestamptz,
  niche_key     text REFERENCES niches(key),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (region_id, osm_id)
);
CREATE INDEX localities_queue_idx ON localities (region_id, status, distance_km);

-- Prospectos.
CREATE TABLE prospects (
  id            serial PRIMARY KEY,
  locality_id   int REFERENCES localities(id) ON DELETE SET NULL,
  niche_key     text REFERENCES niches(key),
  source        text NOT NULL CHECK (source IN ('google_places','osm','manual')),
  source_id     text NOT NULL,
  name          text NOT NULL,
  category      text,
  address       text,
  phone         text,
  website       text,
  email         text,
  instagram     text,
  google_maps_url text,
  reviews_url   text,
  rating        numeric(2,1),
  reviews_count int,
  business_status text,
  lat           double precision,
  lng           double precision,
  status        text NOT NULL DEFAULT 'new'
                CHECK (status IN ('new','enriched','message_ready','report_ready','synced','discarded')),
  notion_page_id text,
  notion_synced_at timestamptz,
  notion_blocks jsonb NOT NULL DEFAULT '{}',   -- ids de bloques escritos por los agentes 3 y 4
  raw           jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, source_id)
);
CREATE INDEX prospects_status_idx ON prospects (status);
CREATE INDEX prospects_locality_idx ON prospects (locality_id);

CREATE TABLE reviews (
  id            serial PRIMARY KEY,
  prospect_id   int NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  author        text,
  rating        int,
  text          text NOT NULL,
  published_at  timestamptz,
  language      text,
  UNIQUE (prospect_id, author, text)
);

-- Salidas de los agentes 3 (mensaje) y 4 (informe). Se versionan: la última es la vigente.
CREATE TABLE outputs (
  id            serial PRIMARY KEY,
  prospect_id   int NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('message','report')),
  status        text NOT NULL CHECK (status IN ('ready','needs_review','pending_manual','failed')),
  content       text,
  prompt        text NOT NULL,
  model         text,
  issues        jsonb NOT NULL DEFAULT '[]',
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outputs_latest_idx ON outputs (prospect_id, kind, created_at DESC);

-- Cola de trabajos para los agentes (FOR UPDATE SKIP LOCKED).
CREATE TABLE jobs (
  id            bigserial PRIMARY KEY,
  type          text NOT NULL,
  payload       jsonb NOT NULL DEFAULT '{}',
  status        text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed')),
  attempts      int NOT NULL DEFAULT 0,
  max_attempts  int NOT NULL DEFAULT 3,
  run_after     timestamptz NOT NULL DEFAULT now(),
  last_error    text,
  result        jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX jobs_pick_idx ON jobs (status, run_after);

-- Configuración clave/valor editable desde la UI.
CREATE TABLE settings (
  key   text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Rubros iniciales. "hospitality" es el nicho principal de Snodic.
INSERT INTO niches (key, label, google_types, keywords, osm_tags, business_label) VALUES
('hospitality', 'Hotelería y alojamientos',
  ARRAY['hotel','lodging','bed_and_breakfast','guest_house','hostel','motel','resort_hotel','extended_stay_hotel','private_guest_room','cottage','farmstay','inn'],
  ARRAY['hotel','apartamentos turísticos','hostal','alojamiento','pensión'],
  '[{"k":"tourism","v":"hotel"},{"k":"tourism","v":"hostel"},{"k":"tourism","v":"guest_house"},{"k":"tourism","v":"apartment"},{"k":"tourism","v":"motel"},{"k":"tourism","v":"chalet"}]',
  'alojamientos'),
('restaurants', 'Restaurantes', ARRAY['restaurant'], ARRAY['restaurante'],
  '[{"k":"amenity","v":"restaurant"}]', 'restaurantes'),
('bars', 'Bares y cafeterías', ARRAY['bar','cafe'], ARRAY['bar','cafetería'],
  '[{"k":"amenity","v":"bar"},{"k":"amenity","v":"cafe"},{"k":"amenity","v":"pub"}]', 'bares');

INSERT INTO settings (key, value) VALUES
('active_niche', '"hospitality"'),
('daily_locality_quota', '3'),
('prospect_source', '"osm"'),
('auto_generate_outputs', 'true');
