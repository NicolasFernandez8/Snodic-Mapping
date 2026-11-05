-- DESTRUCTIVO: borra la lista "no contactar" y la caché de Overpass.
SET search_path TO mapping, public;
DROP INDEX IF EXISTS activities_kind_idx, prospects_assigned_idx, prospects_stage_score_idx, prospects_phone_idx;
DROP TABLE IF EXISTS overpass_cache, do_not_contact;
ALTER TABLE prospects DROP COLUMN IF EXISTS do_not_contact, DROP COLUMN IF EXISTS duplicate_of;
ALTER TABLE localities DROP COLUMN IF EXISTS boundary_simple;
DELETE FROM public.schema_migrations WHERE version = '005_perf_quality';
