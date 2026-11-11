/**
 * Worker de agentes: procesa la cola de trabajos y agenda el pipeline diario.
 * Uso: npm run worker
 */
import cron from "node-cron";
import { config } from "./lib/config";
import { enqueue, failJob, finishJob, LANES, pickJob, requeueStale } from "./lib/jobs";
import { runJob } from "./lib/agents/orchestrator";
import { q } from "./lib/db";
import { heartbeat } from "./lib/status";
import { runDueSchedules } from "./lib/schedules";
import { simplifyArea } from "./lib/geo/simplify";
import type { Area } from "./lib/geo/geometry";

/** Localidades importadas antes de la simplificación: se completan una vez. */
async function backfillSimpleBoundaries() {
  const rows = await q<{ id: number; boundary: Area }>(
    "SELECT id, boundary FROM localities WHERE boundary IS NOT NULL AND boundary_simple IS NULL",
  );
  for (const r of rows)
    await q("UPDATE localities SET boundary_simple = $2::jsonb WHERE id = $1", [r.id, JSON.stringify(simplifyArea(r.boundary))]);
  if (rows.length) log(`Polígonos simplificados: ${rows.length}`);
}

const cfg = config();
let stopping = false;

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function loop() {
  await requeueStale();
  await backfillSimpleBoundaries();
  await heartbeat().catch(() => {});
  setInterval(() => heartbeat().catch((e) => log(`Latido falló: ${e.message}`)), 30000);
  // Mapeos programados desde el calendario: se revisan cada minuto.
  const checkSchedules = () => runDueSchedules(new Date(), log).catch((e) => log(`Programados: ${e.message}`));
  await checkSchedules();
  setInterval(checkSchedules, 60000);
  // Un bucle por carril: los carriles corren en paralelo y cada uno procesa de a un trabajo.
  await Promise.all(Object.entries(LANES).map(([lane, types]) => laneLoop(lane, types)));
}

async function laneLoop(lane: string, types: (typeof LANES)[string]) {
  while (!stopping) {
    const job = await pickJob(types).catch((e) => {
      log(`[${lane}] Error tomando trabajo: ${e.message}`);
      return null;
    });
    if (!job) {
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }
    log(`▶ [${lane}] ${job.type} #${job.id}`);
    const lines: string[] = [];
    try {
      const result = await runJob(job, (m) => {
        lines.push(m);
        log(`  [${lane}] ${m}`);
      });
      await finishJob(job.id, { result, log: lines.slice(-200) });
      log(`✔ [${lane}] ${job.type} #${job.id}`);
    } catch (e) {
      await failJob(job, e as Error);
      log(`✖ [${lane}] ${job.type} #${job.id}: ${(e as Error).message}`);
    }
  }
}

cron.schedule(
  cfg.WORKER_CRON,
  async () => {
    // Evita duplicar el pipeline si el anterior sigue en cola o corriendo.
    const busy = await q("SELECT 1 FROM jobs WHERE type = 'daily_pipeline' AND status IN ('queued','running')");
    if (!busy.length) {
      await enqueue("daily_pipeline");
      log("Pipeline diario encolado");
    }
  },
  { timezone: cfg.TZ },
);

for (const sig of ["SIGINT", "SIGTERM"] as const)
  process.on(sig, () => {
    stopping = true;
    log("Deteniendo worker…");
    setTimeout(() => process.exit(0), 1000);
  });

log(`Worker iniciado. Pipeline diario: "${cfg.WORKER_CRON}" (${cfg.TZ})`);
loop();
