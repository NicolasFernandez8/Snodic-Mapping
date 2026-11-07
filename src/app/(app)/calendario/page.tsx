import { ConfirmButton } from "@/app/confirm-button";
import Link from "next/link";
import { getT, getLang } from "@/lib/i18n/server";
import { getSetting, q } from "@/lib/db";
import { config } from "@/lib/config";
import { listSchedules, occurrences, zonedParts, zonedToUtc } from "@/lib/schedules";
import {
  createScheduleAction,
  deleteScheduleAction,
  setCalendarTzAction,
  toggleScheduleAction,
} from "@/app/feature-actions";
import { MapAmount } from "@/app/map-amount";
import { orFallback } from "@/lib/migration-status";

export const dynamic = "force-dynamic";

const TZS = [
  ["America/Argentina/Buenos_Aires", "Argentina (GMT-3)"],
  ["Europe/Madrid", "España (Madrid)"],
] as const;

const WD_ES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const WD_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function Calendario({ searchParams }: { searchParams: Promise<{ m?: string; day?: string; error?: string }> }) {
  const t = await getT();
  const lang = await getLang();
  const sp = await searchParams;
  const tz = await getSetting<string>("calendar_tz", "America/Argentina/Buenos_Aires");
  const now = zonedParts(new Date(), tz);
  const [year, month] = /^\d{4}-\d{2}$/.test(sp.m ?? "") ? sp.m!.split("-").map(Number) : [now.y, now.m];
  const start = zonedToUtc(year, month, 1, 0, 0, tz);
  const end = zonedToUtc(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1, 1, 0, 0, tz);
  const [schedules, past, dailyQuota] = await Promise.all([
    listSchedules(),
    q<{ id: number; type: string; status: string; created_at: string; payload: { quota?: number; schedule_id?: number } }>(
      `SELECT id, type, status, created_at, payload FROM jobs
       WHERE type IN ('map_localities','daily_pipeline') AND created_at >= $1 AND created_at < $2 ORDER BY created_at`,
      [start, end],
    ),
    getSetting<number>("daily_locality_quota", 3),
  ]);
  const wd = lang === "en" ? WD_EN : WD_ES;
  const fmtTime = (d: Date) => {
    const p = zonedParts(d, tz);
    return `${String(p.h).padStart(2, "0")}:${String(p.mi).padStart(2, "0")}`;
  };
  const dayKey = (d: Date) => {
    const p = zonedParts(d, tz);
    return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
  };

  // Eventos por día
  type Ev = { time: string; label: string; kind: "planned" | "done" | "failed" | "queued" | "season" };
  const byDay = new Map<string, Ev[]>();
  const push = (k: string, e: Ev) => byDay.set(k, [...(byDay.get(k) ?? []), e]);
  for (const s of schedules)
    for (const at of occurrences(s, new Date(Math.max(start.getTime(), Date.now())), end))
      push(dayKey(at), { time: fmtTime(at), label: `${s.name} · ${s.quota}`, kind: "planned" });
  const season = await orFallback(
    q<{ day: string; name: string }>(
      "SELECT to_char(day, 'YYYY-MM-DD') AS day, name FROM season_dates WHERE day >= $1::date AND day < $2::date ORDER BY day",
      [start, end],
    ),
    [],
  );
  for (const s of season) push(s.day, { time: "", label: s.name, kind: "season" });
  // cron diario del worker
  const cron = config().WORKER_CRON.match(/^(\d+) (\d+) \* \* \*$/);
  for (const j of past) {
    const at = new Date(j.created_at);
    push(dayKey(at), {
      time: fmtTime(at),
      label: `${j.type === "daily_pipeline" ? t("Pipeline") : t("Mapeo")}${j.payload?.quota ? ` · ${j.payload.quota}` : ""}`,
      kind: j.status === "done" ? "done" : j.status === "failed" ? "failed" : "queued",
    });
  }

  // Grilla (semana empieza el lunes)
  const firstWd = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const offset = (firstWd + 6) % 7;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const ym = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;
  const prev = month === 1 ? ym(year - 1, 12) : ym(year, month - 1);
  const next = month === 12 ? ym(year + 1, 1) : ym(year, month + 1);
  const monthName = new Intl.DateTimeFormat(lang === "en" ? "en-US" : "es-ES", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, 15)),
  );
  const todayKey = dayKey(new Date());
  const selDay = sp.day && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : todayKey;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t("Calendario de mapeos")}</h1>
          <p className="sub">{t("Programá mapeos para días y horarios. Tocá un día para elegirlo.")}</p>
        </div>
        <form action={setCalendarTzAction} className="row">
          <select name="tz" defaultValue={tz} style={{ width: "auto" }}>
            {TZS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <button className="btn secondary sm">{t("Cambiar zona horaria")}</button>
        </form>
      </div>
      {sp.error && <div className="notice" style={{ borderColor: "var(--err)" }}>{t(sp.error)}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
          <Link className="btn secondary sm" href={`/calendario?m=${prev}`}>←</Link>
          <strong style={{ fontSize: 16 }}>{monthName.charAt(0).toUpperCase() + monthName.slice(1)}</strong>
          <Link className="btn secondary sm" href={`/calendario?m=${next}`}>→</Link>
        </div>
        <div className="cal">
          {[1, 2, 3, 4, 5, 6, 0].map((d) => (
            <div key={d} className="cal-head">{wd[d]}</div>
          ))}
          {cells.map((d, i) => {
            if (!d) return <div key={i} className="cal-cell empty-cell" />;
            const key = `${ym(year, month)}-${String(d).padStart(2, "0")}`;
            const evs = (byDay.get(key) ?? []).sort((a, b) => a.time.localeCompare(b.time));
            return (
              <Link
                key={i}
                href={`/calendario?m=${ym(year, month)}&day=${key}#nuevo`}
                className={`cal-cell ${key === todayKey ? "today" : ""} ${key === selDay ? "sel" : ""}`}
              >
                <span className="cal-day">{d}</span>
                {evs.slice(0, 4).map((e, j) => (
                  <span key={j} className={`cal-ev ${e.kind}`} title={e.label}>{e.time ? `${e.time} ` : "📅 "}{e.label}</span>
                ))}
                {evs.length > 4 && <span className="help">+{evs.length - 4}</span>}
              </Link>
            );
          })}
        </div>
        <div className="legend" style={{ marginTop: 10 }}>
          <span><i style={{ background: "var(--blue)" }} />{t("Programado")}</span>
          <span><i style={{ background: "var(--ok)" }} />{t("Ejecutado")}</span>
          <span><i style={{ background: "var(--err)" }} />{t("Con error")}</span>
          <span><i style={{ background: "var(--series-3)" }} />{t("Feriado o temporada")}</span>
          {cron && (
            <span>
              {t("Además, el pipeline diario automático corre a las {h} ({tz}).", {
                h: `${cron[2].padStart(2, "0")}:${cron[1].padStart(2, "0")}`,
                tz: config().TZ,
              })}
            </span>
          )}
        </div>
      </div>

      <div className="grid two" id="nuevo">
        <form action={createScheduleAction} className="card">
          <h2>{t("Programar una vez")}</h2>
          <input type="hidden" name="kind" value="once" />
          <input type="hidden" name="tz" value={tz} />
          <div className="field"><label htmlFor="n1">{t("Nombre")}</label><input id="n1" name="name" placeholder={t("Mapeo extra")} /></div>
          <div className="row">
            <div className="field" style={{ flex: 1 }}><label htmlFor="d1">{t("Fecha")}</label><input id="d1" type="date" name="date" defaultValue={selDay} required /></div>
            <div className="field" style={{ flex: 1 }}><label htmlFor="h1">{t("Hora")}</label><input id="h1" type="time" name="time" defaultValue="09:00" required /></div>
          </div>
          <JobTypeSelect t={t} />
          <MapAmount defaultLocalities={dailyQuota} compact />
          <button className="btn" style={{ marginTop: 12 }}>{t("Programar")}</button>
        </form>

        <form action={createScheduleAction} className="card">
          <h2>{t("Programar todas las semanas")}</h2>
          <input type="hidden" name="kind" value="weekly" />
          <input type="hidden" name="tz" value={tz} />
          <div className="field"><label htmlFor="n2">{t("Nombre")}</label><input id="n2" name="name" placeholder={t("Mapeo de la semana")} /></div>
          <div className="field">
            <label>{t("Días")}</label>
            <div className="row">
              {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                <label key={d} className="day-pick">
                  <input type="checkbox" name="weekdays" value={d} defaultChecked={d >= 1 && d <= 5} /> {wd[d]}
                </label>
              ))}
            </div>
          </div>
          <div className="field"><label htmlFor="h2">{t("Hora")}</label><input id="h2" type="time" name="time" defaultValue="09:00" required style={{ width: 140 }} /></div>
          <JobTypeSelect t={t} />
          <MapAmount defaultLocalities={dailyQuota} compact />
          <button className="btn" style={{ marginTop: 12 }}>{t("Programar")}</button>
        </form>
      </div>

      <div className="card table-wrap" style={{ marginTop: 16, padding: 0 }}>
        {schedules.length === 0 ? (
          <div className="empty">{t("No hay mapeos programados.")}</div>
        ) : (
          <table>
            <thead>
              <tr><th>{t("Nombre")}</th><th>{t("Cuándo")}</th><th>{t("Qué")}</th><th>{t("Próxima")}</th><th>{t("Última")}</th><th></th></tr>
            </thead>
            <tbody>
              {schedules.map((s) => (
                <tr key={s.id} style={{ opacity: s.active ? 1 : 0.55 }}>
                  <td><strong>{s.name}</strong><div className="help">{s.owner ?? ""}</div></td>
                  <td>
                    {s.kind === "once"
                      ? `${dayKey(new Date(s.run_at!))} ${fmtTime(new Date(s.run_at!))}`
                      : `${s.weekdays.slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => wd[d]).join(", ")} · ${s.time_of_day}`}
                    <div className="help">{s.tz}</div>
                  </td>
                  <td>{s.job_type === "daily_pipeline" ? t("Pipeline completo") : t("Solo mapear")} · {s.unit === "prospects" ? t("{n} prospectos", { n: s.quota }) : t("{n} localidades", { n: s.quota })}</td>
                  <td>{s.next_run_at ? `${dayKey(new Date(s.next_run_at))} ${fmtTime(new Date(s.next_run_at))}` : "-"}</td>
                  <td>{s.last_run_at ? `${dayKey(new Date(s.last_run_at))} ${fmtTime(new Date(s.last_run_at))}` : "-"}</td>
                  <td>
                    <div className="row">
                      <form action={toggleScheduleAction}>
                        <input type="hidden" name="id" value={s.id} />
                        <input type="hidden" name="active" value={s.active ? "0" : "1"} />
                        <button className="btn secondary sm">{s.active ? t("Pausar") : t("Reanudar")}</button>
                      </form>
                      <form action={deleteScheduleAction}>
                        <input type="hidden" name="id" value={s.id} />
                        <ConfirmButton label="Borrar" message="¿Borrar este mapeo programado?" />
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function JobTypeSelect({ t }: { t: (s: string) => string }) {
  return (
    <div className="field">
      <label>{t("Qué hacer")}</label>
      <select name="job_type" defaultValue="map_localities">
        <option value="map_localities">{t("Solo mapear (Agente 1)")}</option>
        <option value="daily_pipeline">{t("Pipeline completo (agentes 1 a 4)")}</option>
      </select>
    </div>
  );
}
