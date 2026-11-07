import { getT } from "@/lib/i18n/server";
import { q } from "@/lib/db";
import { cached } from "@/lib/cache";
import { WhatWorks } from "./what-works";
import { Activity, Bars, Donut, Staircase } from "./charts";
import { PeriodPicker } from "./period-picker";
import { bucket, parsePeriod, windowInterval, type Period } from "@/lib/periods";

/** Color fijo por etapa (sigue a la entidad, no al orden): categórico en orden + gris para descartados. */
const STAGE_COLOR: Record<string, string> = {
  to_contact: "var(--series-1)",
  contacted: "var(--series-2)",
  replied: "var(--series-3)",
  meeting: "var(--series-4)",
  client: "var(--series-5)",
  lost: "var(--series-neutral)",
};
import { STAGES, STAGE_LABEL, type Stage } from "@/lib/crm";

export const dynamic = "force-dynamic";

type Row = { key: string | null; total: number; contacted: number; replied: number; meeting: number; client: number };

const AGG = `count(*)::int AS total,
  count(*) FILTER (WHERE p.stage IN ('contacted','replied','meeting','client') OR (p.stage = 'lost' AND p.contacted_at IS NOT NULL))::int AS contacted,
  count(*) FILTER (WHERE p.stage IN ('replied','meeting','client'))::int AS replied,
  count(*) FILTER (WHERE p.stage IN ('meeting','client'))::int AS meeting,
  count(*) FILTER (WHERE p.stage = 'client')::int AS client`;

const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)} %` : "-");

async function Breakdown({ title, rows, label, actions }: { title: string; rows: Row[]; label: (k: string | null) => string; actions?: React.ReactNode }) {
  const t = await getT();
  const max = Math.max(1, ...rows.map((r) => r.contacted));
  return (
    <div className="card">
      <div className="chart-head">
        <h2>{title}</h2>
        {actions}
      </div>
      {rows.length === 0 ? (
        <div className="empty">{t("Sin datos todavía.")}</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th></th><th>{t("Contactados")}</th><th>{t("Respuesta")}</th><th>{t("Reunión")}</th><th>{t("Clientes")}</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key ?? "-"}>
                  <td style={{ minWidth: 140 }}>
                    <strong>{label(r.key)}</strong>
                    <div className="progress" style={{ marginTop: 4 }}>
                      <div style={{ width: `${(100 * r.contacted) / max}%` }} />
                    </div>
                  </td>
                  <td>{r.contacted}<span className="help"> / {r.total}</span></td>
                  <td><strong>{pct(r.replied, r.contacted)}</strong></td>
                  <td>{pct(r.meeting, r.contacted)}</td>
                  <td>{r.client}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Filtro de ventana sobre prospectos: cuenta desde que se contactó (o, si no, desde que se mapeó). */
const win = (p: Period, alias = "p") => {
  const w = windowInterval(p);
  return w ? `COALESCE(${alias}.contacted_at, ${alias}.created_at) >= now() - interval '${w}'` : "TRUE";
};

type SP = Record<string, string | string[] | undefined>;

export default async function Metricas({ searchParams }: { searchParams: Promise<SP> }) {
  const t = await getT();
  const sp = await searchParams;
  // Un período por gráfico (Todo / Por día / Semanales / Mensuales / Anuales).
  const P = {
    st: parsePeriod(sp.st), fu: parsePeriod(sp.fu), ca: parsePeriod(sp.ca),
    ab: parsePeriod(sp.ab), sc: parsePeriod(sp.sc), rg: parsePeriod(sp.rg), lo: parsePeriod(sp.lo), cg: parsePeriod(sp.cg),
    ac: parsePeriod(sp.ac, "week", false),
  };
  const b = bucket(P.ac);
  const [stages, funnel, byRegion, byLocality, byCategory, byVariant, byScore, activity, catCounts] = await cached(
    `metricas:${JSON.stringify(P)}`,
    60,
    () =>
      Promise.all([
        q<{ stage: Stage; n: number }>(`SELECT stage, count(*)::int AS n FROM prospects p WHERE status <> 'discarded' AND ${win(P.st)} GROUP BY stage`),
        q<{ stage: Stage; n: number }>(`SELECT stage, count(*)::int AS n FROM prospects p WHERE status <> 'discarded' AND ${win(P.fu)} GROUP BY stage`),
        q<Row>(`SELECT r.name AS key, ${AGG} FROM prospects p LEFT JOIN localities l ON l.id = p.locality_id
                LEFT JOIN regions r ON r.id = l.region_id WHERE ${win(P.rg)} GROUP BY r.name ORDER BY contacted DESC LIMIT 10`),
        q<Row>(`SELECT l.name AS key, ${AGG} FROM prospects p LEFT JOIN localities l ON l.id = p.locality_id WHERE ${win(P.lo)}
                GROUP BY l.name HAVING count(*) FILTER (WHERE p.contacted_at IS NOT NULL) > 0 ORDER BY contacted DESC LIMIT 12`),
        q<Row>(`SELECT p.category AS key, ${AGG} FROM prospects p WHERE ${win(P.cg)} GROUP BY p.category ORDER BY contacted DESC LIMIT 10`),
        q<Row>(`SELECT COALESCE(v.key || ' · ' || v.label, p.message_variant) AS key, ${AGG} FROM prospects p
                LEFT JOIN message_variants v ON v.key = p.message_variant WHERE p.message_variant IS NOT NULL AND ${win(P.ab)}
                GROUP BY 1 ORDER BY 1`),
        q<Row>(`SELECT CASE WHEN p.score >= 60 THEN 'Alto (60+)' WHEN p.score >= 35 THEN 'Medio (35–59)' WHEN p.score IS NULL THEN 'Sin puntaje' ELSE 'Bajo (<35)' END AS key,
                ${AGG} FROM prospects p WHERE ${win(P.sc)} GROUP BY 1 ORDER BY 1`),
        q<{ week: string; contacted: number; replied: number }>(
          `SELECT to_char(w, '${b.fmt}') AS week,
             count(a.id) FILTER (WHERE a.kind = 'message_sent')::int AS contacted,
             count(a.id) FILTER (WHERE a.kind = 'stage' AND a.to_stage = 'replied')::int AS replied
           FROM generate_series(date_trunc('${b.unit}', now()) - interval '${b.n - 1} ${b.unit}', date_trunc('${b.unit}', now()), interval '1 ${b.unit}') w
           LEFT JOIN activities a ON a.created_at >= w AND a.created_at < w + interval '1 ${b.unit}'
           GROUP BY w ORDER BY w`,
        ),
        q<{ key: string | null; n: number }>(
          `SELECT category AS key, count(*)::int AS n FROM prospects p WHERE status <> 'discarded' AND duplicate_of IS NULL AND ${win(P.ca)}
           GROUP BY category ORDER BY n DESC LIMIT 8`,
        ),
      ]),
  );
  const counter = (rows: { stage: Stage; n: number }[]) => (s: Stage) => rows.find((f) => f.stage === s)?.n ?? 0;
  // KPIs: siempre sobre el total histórico.
  const all = await cached("metricas:kpis", 60, () =>
    q<{ stage: Stage; n: number }>("SELECT stage, count(*)::int AS n FROM prospects WHERE status <> 'discarded' GROUP BY stage"),
  );
  const count = counter(all);
  const total = all.reduce((a, r) => a + r.n, 0);
  const contacted = count("contacted") + count("replied") + count("meeting") + count("client");
  const replied = count("replied") + count("meeting") + count("client");
  const st = counter(stages);
  const fu = counter(funnel);
  const fuTotal = funnel.reduce((a, r) => a + r.n, 0);
  const pick = (name: keyof typeof P, allowAll = true) => <PeriodPicker name={name} value={P[name]} allowAll={allowAll} />;
  const actTitle = { day: "Actividad por día", week: "Actividad semanal", month: "Actividad mensual", year: "Actividad anual", all: "Actividad semanal" }[P.ac];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t("Métricas de captación")}</h1>
          <p className="sub">{t("Qué zonas, rubros y mensajes funcionan mejor.")}</p>
        </div>
      </div>
      <div className="grid kpis" style={{ marginBottom: 16 }}>
        <div className="card kpi"><div className="label">{t("Prospectos")}</div><div className="value">{total}</div></div>
        <div className="card kpi"><div className="label">{t("Contactados")}</div><div className="value">{contacted}</div></div>
        <div className="card kpi"><div className="label">{t("Tasa de respuesta")}</div><div className="value">{pct(replied, contacted)}</div></div>
        <div className="card kpi"><div className="label">{t("Reuniones")}</div><div className="value">{count("meeting") + count("client")}</div></div>
        <div className="card kpi"><div className="label">{t("Clientes")}</div><div className="value">{count("client")}</div><div className="hint">{t("{p} de conversión", { p: pct(count("client"), contacted) })}</div></div>
      </div>

      <div className="dash-grid">
        <Donut
          title={t("Prospectos por etapa")}
          actions={pick("st")}
          data={STAGES.map((s) => ({ key: s.key, label: t(STAGE_LABEL[s.key]), value: st(s.key), color: STAGE_COLOR[s.key] }))}
        />
        <Staircase
          title={t("Embudo de conversión")}
          actions={pick("fu")}
          steps={[
            { label: t("Prospectos"), value: fuTotal },
            { label: t("Contactados"), value: fu("contacted") + fu("replied") + fu("meeting") + fu("client") },
            { label: t("Respondieron"), value: fu("replied") + fu("meeting") + fu("client") },
            { label: t("Reuniones"), value: fu("meeting") + fu("client") },
            { label: t("Clientes"), value: fu("client") },
          ]}
        />
        <Activity
          title={t(actTitle)}
          actions={pick("ac", false)}
          weeks={activity.map((w) => w.week)}
          series={[
            { name: t("Mensajes enviados"), color: "var(--series-1)", values: activity.map((w) => w.contacted) },
            { name: t("Respuestas"), color: "var(--series-2)", values: activity.map((w) => w.replied) },
          ]}
        />
        <Bars title={t("Prospectos por categoría")} actions={pick("ca")} data={catCounts.map((c) => ({ label: c.key ?? t("Sin categoría"), value: c.n }))} />
      </div>

      <WhatWorks />

      <div className="metrics-grid">
        <Breakdown title={t("A/B de mensajes (Agente 3)")} actions={pick("ab")} rows={byVariant} label={(k) => k ?? "-"} />
        <Breakdown title={t("Por puntaje")} actions={pick("sc")} rows={byScore} label={(k) => (k ? t(k) : "-")} />
        <Breakdown title={t("Por región")} actions={pick("rg")} rows={byRegion} label={(k) => k ?? t("Sin región")} />
        <Breakdown title={t("Por localidad")} actions={pick("lo")} rows={byLocality} label={(k) => k ?? t("Sin localidad")} />
        <Breakdown title={t("Por categoría")} actions={pick("cg")} rows={byCategory} label={(k) => k ?? t("Sin categoría")} />
        <div className="card">
          <div className="chart-head">
            <h2>{t("Actividad por período")}</h2>
            {pick("ac", false)}
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>{t("Período")}</th><th>{t("Mensajes enviados")}</th><th>{t("Respuestas")}</th></tr></thead>
              <tbody>
                {activity.map((w) => (
                  <tr key={w.week}><td>{w.week}</td><td>{w.contacted}</td><td>{w.replied}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <p className="help">{t("Para que el A/B sea confiable hacen falta al menos ~30 contactados por variante.")}</p>
    </>
  );
}
