SET search_path TO mapping, public;
DROP TABLE IF EXISTS schedules;
DELETE FROM public.schema_migrations WHERE version = '007_schedules';
