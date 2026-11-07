SET search_path TO mapping, public;
DROP TABLE IF EXISTS saved_searches;
DROP INDEX IF EXISTS prospects_pain_tags_idx;
ALTER TABLE prospects DROP COLUMN IF EXISTS stars, DROP COLUMN IF EXISTS brand, DROP COLUMN IF EXISTS pain_tags;
DELETE FROM mapping.schema_migrations WHERE version = '006_filters';
