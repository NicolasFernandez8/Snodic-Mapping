import { workerAgeSeconds } from "@/lib/status";

export const dynamic = "force-dynamic";

/**
 * Salud pública y mínima (para que n8n la consulte cada X minutos y avise si algo cae).
 * No expone datos: solo si la base responde y hace cuánto dio señales el worker.
 */
export async function GET() {
  try {
    const age = await workerAgeSeconds();
    const workerOk = age !== null && age < 180;
    return Response.json(
      { ok: workerOk, db: true, worker: workerOk ? "ok" : "down", worker_last_seen_s: age },
      { status: workerOk ? 200 : 503, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ ok: false, db: false }, { status: 503 });
  }
}
