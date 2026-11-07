/**
 * Ejecuta las migraciones pendientes de db/migrations (archivos NNN_nombre.sql, sin ".down").
 * Uso: npm run migrate
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

export async function migrate(databaseUrl: string, dir = join(process.cwd(), "db/migrations")) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    // El registro de migraciones vive en el esquema propio "mapping": desde PostgreSQL 15 un usuario
    // sin privilegios no puede crear tablas en "public".
    await client.query("CREATE SCHEMA IF NOT EXISTS mapping");
    await client.query(
      `CREATE TABLE IF NOT EXISTS mapping.schema_migrations (
         version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`,
    );
    // Compatibilidad: instalaciones que ya tenían el registro en public.
    const legacy = await client.query<{ t: string | null }>("SELECT to_regclass('public.schema_migrations')::text AS t");
    if (legacy.rows[0]?.t)
      await client.query(
        "INSERT INTO mapping.schema_migrations SELECT version, applied_at FROM public.schema_migrations ON CONFLICT DO NOTHING",
      );
    const done = new Set(
      (await client.query<{ version: string }>("SELECT version FROM mapping.schema_migrations")).rows.map(
        (r) => r.version,
      ),
    );
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".sql") && !f.endsWith(".down.sql"))
      .sort();
    const applied: string[] = [];
    for (const f of files) {
      const version = f.replace(/\.sql$/, "");
      if (done.has(version)) continue;
      await client.query("BEGIN");
      try {
        await client.query(readFileSync(join(dir, f), "utf8"));
        await client.query("INSERT INTO mapping.schema_migrations (version) VALUES ($1)", [version]);
        await client.query("COMMIT");
        applied.push(version);
      } catch (e) {
        await client.query("ROLLBACK");
        throw new Error(`Falló la migración ${f}: ${(e as Error).message}`);
      }
    }
    return applied;
  } finally {
    await client.end();
  }
}

if (process.argv[1]?.endsWith("migrate.ts")) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Falta DATABASE_URL");
    process.exit(1);
  }
  migrate(url)
    .then((a) => console.log(a.length ? `Aplicadas: ${a.join(", ")}` : "Sin migraciones pendientes"))
    .catch((e) => {
      console.error(e.message);
      process.exit(1);
    });
}
