-- Reversión de 001_init. DESTRUCTIVO: borra todos los datos del esquema "mapping".
-- Ejecutar solo con backup reciente y aprobación explícita.
DROP SCHEMA IF EXISTS mapping CASCADE;
DELETE FROM public.schema_migrations WHERE version = '001_init';
