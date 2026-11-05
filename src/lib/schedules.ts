/**
 * Mapeos programados: una vez (fecha y hora) o semanales (días + hora), en la zona horaria elegida.
 * El worker revisa cada minuto los vencidos y encola el trabajo con la cantidad de localidades indicada.
 */
import { q, one } from "./db";
import { enqueue } from "./jobs";

export type Schedule = {
  id: number;
  name: string;
  kind: "once" | "weekly";
  job_type: "map_localities" | "daily_pipeline";
  quota: number;
  run_at: string | null;
  weekdays: number[];
  time_of_day: string | null;
  tz: string;
  active: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
  last_job_id: number | null;
  created_by: number | null;
  owner?: string | null;
};

/** Partes de fecha/hora de un instante en una zona horaria. */
export function zonedParts(date: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { y: +get("year"), m: +get("month"), d: +get("day"), h: +get("hour"), mi: +get("minute"), s: +get("second"), wd };
}

/** Convierte una fecha/hora "de reloj" en `tz` al instante UTC correspondiente (maneja horario de verano). */
export function zonedToUtc(y: number, m: number, d: number, h: number, mi: number, tz: string): Date {
  let guess = Date.UTC(y, m - 1, d, h, mi);
  for (let i = 0; i < 3; i++) {
    const p = zonedParts(new Date(guess), tz);
    const diff = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi) - Date.UTC(y, m - 1, d, h, mi);
    if (diff === 0) break;
    guess -= diff;
  }
  return new Date(guess);
}

/** Próxima ejecución después de `from` (o null si ya no hay). */
export function nextRun(s: Pick<Schedule, "kind" | "run_at" | "weekdays" | "time_of_day" | "tz">, from = new Date()): Date | null {
  if (s.kind === "once") {
    const at = s.run_at ? new Date(s.run_at) : null;
    return at && at > from ? at : null;
  }
  if (!s.time_of_day || !s.weekdays.length) return null;
  const [h, mi] = s.time_of_day.split(":").map(Number);
  const today = zonedParts(from, s.tz);
  for (let add = 0; add <= 7; add++) {
    const base = new Date(Date.UTC(today.y, today.m - 1, today.d + add, 12));
    const wd = base.getUTCDay();
    if (!s.weekdays.includes(wd)) continue;
    const at = zonedToUtc(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), h, mi, s.tz);
    if (at > from) return at;
  }
  return null;
}

/** Todas las ejecuciones previstas entre dos fechas (para dibujar el calendario). */
export function occurrences(s: Schedule, start: Date, end: Date): Date[] {
  if (!s.active) return [];
  if (s.kind === "once") {
    const at = s.run_at ? new Date(s.run_at) : null;
    return at && at >= start && at < end ? [at] : [];
  }
  const out: Date[] = [];
  let cur = new Date(start.getTime() - 1);
  for (let i = 0; i < 400; i++) {
    const n = nextRun(s, cur);
    if (!n || n >= end) break;
    out.push(n);
    cur = n;
  }
  return out;
}

export async function listSchedules(): Promise<Schedule[]> {
  return q<Schedule>(
    `SELECT s.*, u.username AS owner FROM schedules s LEFT JOIN users u ON u.id = s.created_by
     ORDER BY s.active DESC, s.next_run_at NULLS LAST, s.id`,
  );
}

export type NewSchedule = {
  name: string;
  kind: "once" | "weekly";
  jobType: "map_localities" | "daily_pipeline";
  quota: number;
  date?: string; // YYYY-MM-DD (once)
  time: string; // HH:MM
  weekdays?: number[];
  tz: string;
};

export async function createSchedule(input: NewSchedule, userId: number) {
  if (!/^\d{2}:\d{2}$/.test(input.time)) throw new Error("Hora inválida");
  const quota = Math.max(1, Math.min(50, Math.round(input.quota)));
  let runAt: Date | null = null;
  const weekdays = (input.weekdays ?? []).filter((d) => d >= 0 && d <= 6);
  if (input.kind === "once") {
    if (!input.date || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error("Fecha inválida");
    const [y, m, d] = input.date.split("-").map(Number);
    const [h, mi] = input.time.split(":").map(Number);
    runAt = zonedToUtc(y, m, d, h, mi, input.tz);
    if (runAt <= new Date()) throw new Error("La fecha y hora ya pasaron");
  } else if (!weekdays.length) throw new Error("Elegí al menos un día");
  const draft = { kind: input.kind, run_at: runAt?.toISOString() ?? null, weekdays, time_of_day: input.time, tz: input.tz };
  const next = nextRun(draft);
  return one<{ id: number }>(
    `INSERT INTO schedules (name, kind, job_type, quota, run_at, weekdays, time_of_day, tz, next_run_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [
      input.name.trim().slice(0, 80) || "Mapeo programado",
      input.kind,
      input.jobType,
      quota,
      runAt,
      weekdays,
      input.kind === "weekly" ? input.time : null,
      input.tz,
      next,
      userId,
    ],
  );
}

export async function setScheduleActive(id: number, active: boolean) {
  const s = await one<Schedule>("SELECT * FROM schedules WHERE id = $1", [id]);
  if (!s) return;
  await q("UPDATE schedules SET active = $2, next_run_at = $3 WHERE id = $1", [id, active, active ? nextRun(s) : null]);
}

export async function deleteSchedule(id: number) {
  await q("DELETE FROM schedules WHERE id = $1", [id]);
}

/** Lo llama el worker cada minuto: encola los vencidos y calcula la próxima ejecución. */
export async function runDueSchedules(now = new Date(), log: (m: string) => void = () => {}) {
  const due = await q<Schedule>(
    `UPDATE schedules SET last_run_at = now()
     WHERE id IN (SELECT id FROM schedules WHERE active AND next_run_at <= $1 FOR UPDATE SKIP LOCKED)
     RETURNING *`,
    [now],
  );
  for (const s of due) {
    const job = await enqueue(s.job_type, { quota: s.quota, schedule_id: s.id });
    const next = nextRun(s, new Date(now.getTime() + 1000));
    await q("UPDATE schedules SET next_run_at = $2, last_job_id = $3, active = $4 WHERE id = $1", [
      s.id,
      next,
      job?.id ?? null,
      next !== null,
    ]);
    log(`Programado "${s.name}": ${s.job_type} con ${s.quota} localidades (próximo: ${next?.toISOString() ?? "—"})`);
  }
  return due.length;
}
