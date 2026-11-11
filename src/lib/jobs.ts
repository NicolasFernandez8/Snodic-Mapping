import { one, q } from "./db";

export type JobType =
  | "import_region"
  | "map_localities"
  | "collect_data"
  | "generate_messages"
  | "generate_reports"
  | "sync_notion"
  | "notion_pull"
  | "notion_fix"
  | "write_prospect"
  | "daily_pipeline"
  | "rescore"
  | "watch_openings"
  | "daily_digest"
  | "enrich_open"
  | "season"
  | "classify_phones"
  | "dedupe";

export type Job = {
  id: number;
  type: JobType;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
};

/**
 * Carriles del worker: cada carril procesa un trabajo por vez y los carriles corren en paralelo.
 * Así un mapeo largo no frena a Notion ni a la IA, y la IA (placa de video) nunca corre dos veces a la vez.
 */
export const LANES: Record<string, JobType[]> = {
  ia: ["write_prospect", "generate_messages", "generate_reports"],
  mapa: ["import_region", "map_localities", "watch_openings"],
  datos: ["collect_data", "enrich_open", "classify_phones", "season", "dedupe", "rescore", "daily_digest"],
  notion: ["sync_notion", "notion_pull", "notion_fix"],
  pipeline: ["daily_pipeline"],
};

/** Encola un trabajo; si ya hay uno igual esperando en la cola, devuelve ese (no se duplica). */
export async function enqueue(type: JobType, payload: Record<string, unknown> = {}) {
  const body = JSON.stringify(payload);
  const same = await one<{ id: number }>(
    "SELECT id FROM jobs WHERE type = $1 AND payload = $2::jsonb AND status = 'queued' ORDER BY id LIMIT 1",
    [type, body],
  );
  if (same) return same;
  return one<{ id: number }>("INSERT INTO jobs (type, payload) VALUES ($1, $2::jsonb) RETURNING id", [type, body]);
}

/** Toma el próximo trabajo disponible de forma segura entre varios workers. */
export async function pickJob(types?: JobType[]): Promise<Job | null> {
  return one<Job>(
    `UPDATE jobs SET status = 'running', attempts = attempts + 1, updated_at = now()
     WHERE id = (
       SELECT id FROM jobs WHERE status = 'queued' AND run_after <= now()
         AND ($1::text[] IS NULL OR type = ANY($1::text[]))
       ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1)
     RETURNING id, type, payload, attempts, max_attempts`,
    [types ?? null],
  );
}

export async function finishJob(id: number, result: unknown) {
  await q("UPDATE jobs SET status = 'done', result = $2::jsonb, last_error = NULL, updated_at = now() WHERE id = $1", [
    id,
    JSON.stringify(result ?? null),
  ]);
}

export async function failJob(job: Job, err: Error) {
  const retry = job.attempts < job.max_attempts;
  await q(
    `UPDATE jobs SET status = $2, last_error = $3, updated_at = now(),
       run_after = now() + ($4 || ' minutes')::interval WHERE id = $1`,
    [job.id, retry ? "queued" : "failed", err.message.slice(0, 2000), String(5 * job.attempts)],
  );
}

/** Recupera trabajos que quedaron "running" por un corte del worker. */
export async function requeueStale(minutes = 30) {
  await q(
    `UPDATE jobs SET status = 'queued', updated_at = now()
     WHERE status = 'running' AND updated_at < now() - ($1 || ' minutes')::interval`,
    [String(minutes)],
  );
}
