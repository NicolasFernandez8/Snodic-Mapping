SET search_path TO mapping, public;
DROP TABLE IF EXISTS schedules;
DELETE FROM mapping.schema_migrations WHERE version = '007_schedules';
