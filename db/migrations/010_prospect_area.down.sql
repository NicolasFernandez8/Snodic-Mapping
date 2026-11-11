DROP INDEX IF EXISTS prospects_area_pending_idx;
ALTER TABLE prospects DROP COLUMN IF EXISTS area;
