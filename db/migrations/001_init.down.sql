-- Reversión de 001_init. DESTRUCTIVO: borra todos los datos del esquema "mapping".
-- Ejecutar solo con backup reciente y aprobación explícita.
DROP SCHEMA IF EXISTS mapping CASCADE;
-- El registro de migraciones vive dentro de "mapping" y se borra con el esquema.
