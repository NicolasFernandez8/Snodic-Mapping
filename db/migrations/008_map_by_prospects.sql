-- Mapear por cantidad de prospectos: localidades parcialmente mapeadas y unidad en los programados.
-- Reversión: db/migrations/008_map_by_prospects.down.sql
SET search_path TO mapping, public;

ALTER TABLE localities DROP CONSTRAINT IF EXISTS localities_status_check;
ALTER TABLE localities ADD CONSTRAINT localities_status_check
  CHECK (status IN ('pending','mapping','partial','mapped','failed','skipped'));

ALTER TABLE schedules ADD COLUMN unit text NOT NULL DEFAULT 'localities' CHECK (unit IN ('localities','prospects'));
ALTER TABLE schedules DROP CONSTRAINT IF EXISTS schedules_quota_check;
ALTER TABLE schedules ADD CONSTRAINT schedules_quota_check CHECK (quota BETWEEN 1 AND 500);
