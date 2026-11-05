import { getT } from "@/lib/i18n/server";
import { q } from "@/lib/db";
import { STAGES, STAGE_LABEL, type Stage } from "@/lib/crm";

export const dynamic = "force-dynamic";

type Row = { key: string | null; total: number; contacted: number; replied: number; meeting: number; client: number };

const AGG = `count(*)::int AS total,
  count(*) FILTER (WHERE p.stage IN ('contacted','replied','meeting','client') OR (p.stage = 'lost' AND p.contacted_at IS NOT NULL))::int AS contacted,
  count(*) FILTER (WHERE p.stage IN ('replied','meeting','client'))::int AS replied,
  count(*) FILTER (WHERE p.stage IN ('meeting','client'))::int AS meeting,
  count(*) FILTER (WHERE p.stage = 'client')::int AS client`;

const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)} %` : "-");

async function Breakdown({ title, rows, label }: { title: string; rows: Row[]; label: (k: string | null) => string }) {
  const t = await getT();
  const max = Math.max(1, ...rows.map((r) => r.contacted));
  return (
    <div className="card">
      <h2>{title}</h2>
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

export default async function Metricas() {
  const t = await getT();
  const [funnel, byRegion, byLocality, byCategory, byVariant, byScore, weekly] = await Promise.all([
    q<{ stage: Stage; n: number }>("SELECT stage, count(*)::int AS n FROM prospects WHERE status <> 'discarded' GROUP BY stage"),
    q<Row>(`SELECT r.name AS key, ${AGG} FROM prospects p LEFT JOIN localities l ON l.id = p.locality_id
            LEFT JOIN regions r ON r.id = l.region_id GROUP BY r.name ORDER BY contacted DESC LIMIT 10`),
    q<Row>(`SELECT l.name AS key, ${AGG} FROM prospects p LEFT JOIN localities l ON l.id = p.locality_id
            GROUP BY l.name HAVING count(*) FILTER (WHERE p.contacted_at IS NOT NULL) > 0 ORDER BY contacted DESC LIMIT 12`),
    q<Row>(`SELECT p.category AS key, ${AGG} FROM prospects p GROUP BY p.category ORDER BY contacted DESC LIMIT 10`),
    q<Row>(`SELECT COALESCE(v.key || ' · ' || v.label, p.message_variant) AS key, ${AGG} FROM prospects p
            LEFT JOIN message_variants v ON v.key = p.message_variant WHERE p.message_variant IS NOT NULL
            GROUP BY 1 ORDER BY 1`),
    q<Row>(`SELECT CASE WHEN p.score >= 60 THEN 'Alto (60+)' WHEN p.score >= 35 THEN 'Medio (35–59)' WHEN p.score IS NULL THEN 'Sin puntaje' ELSE 'Bajo (<35)' END AS key,
            ${AGG} FROM prospects p GROUP BY 1 ORDER BY 1`),
    q<{ week: string; contacted: number; replied: number }>(
      `SELECT to_char(date_trunc('week', created_at), 'DD/MM') AS week,
         count(*) FILTER (WHERE kind IN ('message_sent'))::int AS contacted,
         count(*) FILTER (WHERE kind = 'stage' AND to_stage = 'replied')::int AS replied
       FROM activities WHERE created_at > now() - interval '8 weeks' GROUP BY date_trunc('week', created_at) ORDER BY date_trunc('week', created_at)`,
    ),
  ]);
  const count = (s: Stage) => funnel.find((f) => f.stage === s)?.n ?? 0;
  const total = funnel.reduce((a, b) => a + b.n, 0);
  const contacted = count("contacted") + count("replied") + count("meeting") + count("client");
  const replied = count("replied") + count("meeting") + count("client");

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

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>{t("Embudo")}</h2>
        {STAGES.filter((s) => s.key !== "lost").map((s) => (
          <div key={s.key} style={{ marginBottom: 8 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span>{t(STAGE_LABEL[s.key])}</span>
              <strong>{count(s.key)}</strong>
            </div>
            <div className="progress"><div style={{ width: `${total ? (100 * count(s.key)) / total : 0}%` }} /></div>
          </div>
        ))}
        <p className="help">{t("Descartados:")} {count("lost")}</p>
      </div>

      <div className="grid two">
        <Breakdown title={t("A/B de mensajes (Agente 3)")} rows={byVariant} label={(k) => k ?? "-"} />
        <Breakdown title={t("Por puntaje")} rows={byScore} label={(k) => k ?? "-"} />
        <Breakdown title={t("Por región")} rows={byRegion} label={(k) => k ?? t("Sin región")} />
        <Breakdown title={t("Por localidad")} rows={byLocality} label={(k) => k ?? t("Sin localidad")} />
        <Breakdown title={t("Por categoría")} rows={byCategory} label={(k) => k ?? t("Sin categoría")} />
        <div className="card">
          <h2>{t("Últimas semanas")}</h2>
          {weekly.length === 0 ? (
            <div className="empty">{t("Sin actividad todavía.")}</div>
          ) : (
            <table>
              <thead><tr><th>{t("Semana")}</th><th>{t("Mensajes enviados")}</th><th>{t("Respuestas")}</th></tr></thead>
              <tbody>
                {weekly.map((w) => (
                  <tr key={w.week}><td>{w.week}</td><td>{w.contacted}</td><td>{w.replied}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <p className="help">{t("Para que el A/B sea confiable hacen falta al menos ~30 contactados por variante.")}</p>
    </>
  );
}
