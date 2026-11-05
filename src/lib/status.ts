import { createHash } from "node:crypto";
import { getSetting, one, setSetting } from "./db";

/** Lo llama el worker cada 30 s. */
export async function heartbeat() {
  await setSetting("worker_heartbeat", new Date().toISOString());
}

export async function workerAgeSeconds(): Promise<number | null> {
  const at = await getSetting<string | null>("worker_heartbeat", null);
  return at ? Math.round((Date.now() - new Date(at).getTime()) / 1000) : null;
}

/**
 * Estado liviano para el refresco en vivo: si hay agentes trabajando y una "versión" de los datos.
 * La página solo se vuelve a renderizar cuando la versión cambia.
 */
export async function liveStatus() {
  const r = (await one<{ busy: boolean; v: string }>(`SELECT
      EXISTS (SELECT 1 FROM jobs WHERE status IN ('queued','running')) AS busy,
      concat_ws('|',
        (SELECT max(updated_at) FROM jobs), (SELECT count(*) FROM prospects), (SELECT max(updated_at) FROM prospects),
        (SELECT count(*) FROM localities WHERE status = 'mapped'), (SELECT max(id) FROM activities), (SELECT max(id) FROM outputs)
      ) AS v`))!;
  return { busy: r.busy, version: createHash("sha1").update(r.v).digest("hex").slice(0, 12), workerAge: await workerAgeSeconds() };
}
