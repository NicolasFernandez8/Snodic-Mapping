SET search_path TO mapping, public;
ALTER TABLE prospects DROP COLUMN IF EXISTS business_days, DROP COLUMN IF EXISTS business_hours, DROP COLUMN IF EXISTS facebook;
DELETE FROM public.schema_migrations WHERE version = '002_notion_fields';
