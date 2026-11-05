-- DESTRUCTIVO: borra usuarios y sesiones.
SET search_path TO mapping, public;
DROP TABLE IF EXISTS login_attempts, sessions, users;
DELETE FROM public.schema_migrations WHERE version = '003_users';
