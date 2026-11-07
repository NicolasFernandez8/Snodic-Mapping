SET search_path TO mapping, public;
DELETE FROM message_variants WHERE key = 'T';
DELETE FROM settings WHERE key IN ('daily_digest_size','reactivate_after_days','watch_openings_days');
ALTER TABLE case_studies DROP COLUMN IF EXISTS draft, DROP COLUMN IF EXISTS prospect_id;
DROP TABLE IF EXISTS season_dates;
DROP INDEX IF EXISTS prospects_phone_type_idx;
ALTER TABLE prospects DROP COLUMN IF EXISTS phone_type, DROP COLUMN IF EXISTS is_new_opening,
  DROP COLUMN IF EXISTS wikidata_id, DROP COLUMN IF EXISTS enriched_at, DROP COLUMN IF EXISTS reactivated_at;
DELETE FROM mapping.schema_migrations WHERE version = '009_agents_plus';
