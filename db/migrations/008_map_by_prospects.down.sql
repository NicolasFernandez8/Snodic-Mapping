SET search_path TO mapping, public;
UPDATE localities SET status = 'pending' WHERE status = 'partial';
ALTER TABLE localities DROP CONSTRAINT IF EXISTS localities_status_check;
ALTER TABLE localities ADD CONSTRAINT localities_status_check
  CHECK (status IN ('pending','mapping','mapped','failed','skipped'));
ALTER TABLE schedules DROP COLUMN IF EXISTS unit;
UPDATE schedules SET quota = 50 WHERE quota > 50;
ALTER TABLE schedules DROP CONSTRAINT IF EXISTS schedules_quota_check;
ALTER TABLE schedules ADD CONSTRAINT schedules_quota_check CHECK (quota BETWEEN 1 AND 50);
DELETE FROM mapping.schema_migrations WHERE version = '008_map_by_prospects';
