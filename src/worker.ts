/**
 * Worker de agentes: procesa la cola de trabajos y agenda el pipeline diario.
 * Uso: npm run worker
 */
import cron from "node-cron";
import { config } from "./lib/config";
import { enqueue, failJob, finishJob, pickJob, requeueStale } from "./lib/jobs";
import { runJob } from "./lib/agents/orchestrator";
import { q } from "./lib/db";

const cfg = config();
let stopping = false;

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function loop() {
  await requeueStale();
  while (!stopping) {
    const job = await pickJob().catch((e) => {
      log(`Error tomando trabajo: ${e.message}`);
      return null;
    });
    if (!job) {
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    log(`▶ ${job.type} #${job.id}`);
    const lines: string[] = [];
    try {
      const result = await runJob(job, (m) => {
        lines.push(m);
        log(`  ${m}`);
      });
      await finishJob(job.id, { result, log: lines.slice(-200) });
      log(`✔ ${job.type} #${job.id}`);
    } catch (e) {
      await failJob(job, e as Error);
      log(`✖ ${job.type} #${job.id}: ${(e as Error).message}`);
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
