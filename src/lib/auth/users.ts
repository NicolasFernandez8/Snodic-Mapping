import { createHash, randomBytes } from "node:crypto";
import { one, q } from "../db";
import { hashPassword, verifyPassword } from "./password";

export type Role = "admin" | "member";
export type User = { id: number; username: string; role: Role; created_at: string; last_login_at: string | null };

export const SESSION_COOKIE = "snodic_session";
export const SESSION_DAYS = 30;
const MAX_FAILS = 5; // intentos fallidos por usuario en 15 minutos

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

function validUsername(u: string) {
  if (!/^[A-Za-z0-9._-]{3,32}$/.test(u)) throw new Error("Usuario inválido: 3 a 32 caracteres (letras, números, . _ -)");
}

export async function createUser(username: string, password: string, role: Role): Promise<User> {
  validUsername(username);
  const exists = await one("SELECT 1 FROM users WHERE lower(username) = lower($1)", [username]);
  if (exists) throw new Error(`El usuario "${username}" ya existe`);
  return (await one<User>(
    "INSERT INTO users (username, password_hash, role) VALUES ($1,$2,$3) RETURNING id, username, role, created_at, last_login_at",
    [username, await hashPassword(password), role],
  ))!;
}

export async function setPassword(username: string, password: string) {
  const rows = await q("UPDATE users SET password_hash = $2 WHERE lower(username) = lower($1) RETURNING id", [
    username,
    await hashPassword(password),
  ]);
  if (!rows.length) throw new Error(`No existe el usuario "${username}"`);
  // Cierra las sesiones abiertas con la contraseña anterior.
  await q("DELETE FROM sessions WHERE user_id = $1", [(rows[0] as { id: number }).id]);
}

export async function setRole(username: string, role: Role) {
  if (role !== "admin") {
    const admins = await q<{ username: string }>("SELECT username FROM users WHERE role = 'admin'");
    if (admins.length === 1 && admins[0].username.toLowerCase() === username.toLowerCase())
      throw new Error("No se puede quitar el rol al último administrador");
  }
  const rows = await q("UPDATE users SET role = $2 WHERE lower(username) = lower($1) RETURNING id", [username, role]);
  if (!rows.length) throw new Error(`No existe el usuario "${username}"`);
}

export async function deleteUser(username: string) {
  const target = await one<{ id: number; role: Role }>("SELECT id, role FROM users WHERE lower(username) = lower($1)", [username]);
  if (!target) throw new Error(`No existe el usuario "${username}"`);
  if (target.role === "admin") {
    const admins = (await one<{ n: number }>("SELECT count(*)::int AS n FROM users WHERE role = 'admin'"))!.n;
    if (admins <= 1) throw new Error("No se puede borrar el último administrador");
  }
  await q("DELETE FROM users WHERE id = $1", [target.id]);
}

export async function listUsers(): Promise<User[]> {
  return q<User>("SELECT id, username, role, created_at, last_login_at FROM users ORDER BY username");
}

/** Verifica credenciales con límite de intentos. Devuelve el token de sesión o null. */
export async function login(username: string, password: string, ip: string | null): Promise<string | null> {
  const fails = (await one<{ n: number }>(
    "SELECT count(*)::int AS n FROM login_attempts WHERE lower(username) = lower($1) AND created_at > now() - interval '15 minutes'",
    [username],
  ))!.n;
  if (fails >= MAX_FAILS) throw new Error("Demasiados intentos. Probá de nuevo en 15 minutos.");
  const user = await one<{ id: number; password_hash: string }>(
    "SELECT id, password_hash FROM users WHERE lower(username) = lower($1)",
    [username],
  );
  const ok = user ? await verifyPassword(password, user.password_hash) : await verifyPassword(password, DUMMY_HASH);
  if (!user || !ok) {
    await q("INSERT INTO login_attempts (username, ip) VALUES ($1,$2)", [username.slice(0, 64), ip]);
    return null;
  }
  await q("DELETE FROM login_attempts WHERE lower(username) = lower($1)", [username]);
  await q("DELETE FROM sessions WHERE expires_at < now()");
  const token = randomBytes(32).toString("base64url");
  await q(
    `INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1,$2, now() + ($3 || ' days')::interval)`,
    [sha256(token), user.id, String(SESSION_DAYS)],
  );
  await q("UPDATE users SET last_login_at = now() WHERE id = $1", [user.id]);
  return token;
}

export async function userFromToken(token: string | undefined | null): Promise<User | null> {
  if (!token) return null;
  return one<User>(
    `SELECT u.id, u.username, u.role, u.created_at, u.last_login_at FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [sha256(token)],
  );
}

export async function logout(token: string | undefined | null) {
  if (token) await q("DELETE FROM sessions WHERE token_hash = $1", [sha256(token)]);
}

// Hash fijo para que un usuario inexistente tarde lo mismo que uno existente.
const DUMMY_HASH =
  "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
