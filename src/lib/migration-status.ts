/**
 * Migraciones de db/migrations que todavía no se aplicaron en la base.
 * Sirve para avisar en la app (en vez de romper páginas) cuando se actualizó el código y faltó correr `migrate`.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { q } from "./db";

let cache: { at: number; pending: string[] } | null = null;

export async function pendingMigrations(dir = join(process.cwd(), "db/migrations")): Promise<string[]> {
  if (cache && Date.now() - cache.at < 60_000) return cache.pending;
  try {
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".sql") && !f.endsWith(".down.sql"))
      .map((f) => f.replace(/\.sql$/, ""))
      .sort();
    const done = new Set((await q<{ version: string }>("SELECT version FROM mapping.schema_migrations")).map((r) => r.version));
    const pending = files.filter((f) => !done.has(f));
    cache = { at: Date.now(), pending };
    return pending;
  } catch {
    return [];
  }
}

/** Devuelve el resultado o, si la consulta falla (por ejemplo, falta una migración), el valor de respaldo. */
export async function orFallback<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch (e) {
    console.error("[snodic] consulta con respaldo:", (e as Error).message);
    return fallback;
  }
}

/** ¿Está aplicada la migración 009 (agentes 6–17)? */
export async function hasAgentsPlus(): Promise<boolean> {
  return !(await pendingMigrations()).includes("009_agents_plus");
}
