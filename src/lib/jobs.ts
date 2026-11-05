import { one, q } from "./db";

export type JobType =
  | "import_region"
  | "map_localities"
  | "collect_data"
  | "generate_messages"
  | "generate_reports"
  | "sync_notion"
  | "daily_pipeline";

export type Job = {
  id: number;
  type: JobType;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
};

export async function enqueue(type: JobType, payload: Record<string, unknown> = {}) {
  return one<{ id: number }>(
    "INSERT INTO jobs (type, payload) VALUES ($1, $2::jsonb) RETURNING id",
    [type, JSON.stringify(payload)],
  );
}

/** Toma el próximo trabajo disponible de forma segura entre varios workers. */
export async function pickJob(): Promise<Job | null> {
  return one<Job>(
    `UPDATE jobs SET status = 'running', attempts = attempts + 1, updated_at = now()
     WHERE id = (
       SELECT id FROM jobs WHERE status = 'queued' AND run_after <= now()
       ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1)
     RETURNING id, type, payload, attempts, max_attempts`,
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
