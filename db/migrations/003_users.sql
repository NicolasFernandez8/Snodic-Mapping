-- Usuarios de la app y sesiones. Las contraseñas se guardan solo como hash scrypt.
-- Reversión: db/migrations/003_users.down.sql
SET search_path TO mapping, public;

CREATE TABLE users (
  id            serial PRIMARY KEY,
  username      text NOT NULL,
  password_hash text NOT NULL,
  role          text NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);
CREATE UNIQUE INDEX users_username_idx ON users (lower(username));

CREATE TABLE sessions (
  token_hash  text PRIMARY KEY,            -- sha256 del token de la cookie (el token nunca se guarda)
  user_id     int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

-- Intentos fallidos de login para frenar fuerza bruta.
CREATE TABLE login_attempts (
  id         bigserial PRIMARY KEY,
  username   text NOT NULL,
  ip         text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_attempts_idx ON login_attempts (lower(username), created_at);
