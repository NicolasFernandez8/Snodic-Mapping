import { getT } from "@/lib/i18n/server";
import Link from "next/link";
import { getSetting, one, q } from "@/lib/db";
import { workerAgeSeconds } from "@/lib/status";
import { runAgent } from "@/app/actions";
import { AutoRefresh } from "@/app/auto-refresh";
import { Badge, fmtDate, JOB_LABEL } from "@/app/ui";

export const dynamic = "force-dynamic";

export default async function Panel() {
  const t = await getT();
  const [stats, regions, jobs, niche, quota] = await Promise.all([
    one<Record<string, number>>(`SELECT
      (SELECT count(*)::int FROM localities) AS loc_total,
      (SELECT count(*)::int FROM localities WHERE status = 'mapped') AS loc_mapped,
      (SELECT count(*)::int FROM prospects WHERE status <> 'discarded') AS prospects,
      (SELECT count(*)::int FROM prospects WHERE created_at > now() - interval '24 hours') AS prospects_today,
      (SELECT count(*)::int FROM prospects WHERE status IN ('message_ready','report_ready','synced')) AS with_message,
      (SELECT count(*)::int FROM prospects WHERE status IN ('report_ready','synced')) AS with_report,
      (SELECT count(*)::int FROM prospects WHERE status = 'synced') AS synced,
      (SELECT count(DISTINCT prospect_id)::int FROM outputs o WHERE status IN ('needs_review','pending_manual')
         AND o.id = (SELECT id FROM outputs x WHERE x.prospect_id = o.prospect_id AND x.kind = o.kind ORDER BY created_at DESC, id DESC LIMIT 1)) AS to_review`),
    q<{ id: number; name: string; status: string; total: number; mapped: number; prospects: number }>(`
      SELECT r.id, r.name, r.status,
        count(l.id)::int AS total, count(l.id) FILTER (WHERE l.status = 'mapped')::int AS mapped,
        COALESCE(sum(l.prospects_found),0)::int AS prospects
      FROM regions r LEFT JOIN localities l ON l.region_id = r.id GROUP BY r.id ORDER BY r.position`),
    q<{ id: number; type: string; status: string; updated_at: string; last_error: string | null }>(
      "SELECT id, type, status, updated_at, last_error FROM jobs ORDER BY id DESC LIMIT 6",
    ),
    getSetting<string>("active_niche", "hospitality").then((k) =>
      one<{ label: string }>("SELECT label FROM niches WHERE key = $1", [k]),
    ),
    getSetting<number>("daily_locality_quota", 3),
  ]);
  const s = stats ?? {};
  const workerAge = await workerAgeSeconds();
  const kpis = [
    { label: t("Localidades mapeadas"), value: `${s.loc_mapped ?? 0}/${s.loc_total ?? 0}`, hint: t("{n} por día", { n: quota }) },
    { label: t("Prospectos"), value: s.prospects ?? 0, hint: t("+{n} en 24 h", { n: s.prospects_today ?? 0 }) },
    { label: t("Mensajes (Agente 3)"), value: s.with_message ?? 0, hint: t("listos para enviar") },
    { label: t("Informes (Agente 4)"), value: s.with_report ?? 0, hint: t("con 2 ideas") },
    { label: t("En Notion"), value: s.synced ?? 0, hint: t("página completa") },
    { label: t("Para revisar"), value: s.to_review ?? 0, hint: t("revisión humana") },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t("Panel de captación")}</h1>
          <p className="sub">
            {t("Rubro activo:")}{" "}<strong>{niche?.label ?? "-"}</strong> · <Link href="/ajustes">{t("cambiar")}</Link>
          </p>
        </div>
        <form action={runAgent} className="row">
          <AutoRefresh active={jobs.some((j) => j.status === "queued" || j.status === "running")} />
          <input type="hidden" name="type" value="daily_pipeline" />
          <button className="btn">{t("▶ Ejecutar pipeline ahora")}</button>
        </form>
      </div>

      {(workerAge === null || workerAge > 180) && (
        <div className="notice" style={{ borderColor: "var(--err)" }}>
          {workerAge === null
            ? t("El worker de agentes nunca se inició: los agentes no van a correr. Revisá el contenedor snodic-mapping-worker.")
            : t("El worker de agentes no da señales hace {n} min: revisá el contenedor snodic-mapping-worker.", { n: Math.round(workerAge / 60) })}
        </div>
      )}
      <div className="grid kpis" style={{ marginBottom: 16 }}>
        {kpis.map((k) => (
          <div key={k.label} className="card kpi">
            <div className="label">{k.label}</div>
            <div className="value">{k.value}</div>
            <div className="hint">{k.hint}</div>
          </div>
        ))}
      </div>

      <div className="grid two">
        <div className="card">
          <h2>{t("Recorrido por regiones")}</h2>
          {regions.length === 0 ? (
            <div className="empty">
              {t("Todavía no hay regiones.")}{" "}<Link href="/ajustes#region">{t("Importá Alicante")}</Link>{" "}{t("para empezar.")}
            </div>
          ) : (
            regions.map((r) => (
              <div key={r.id} style={{ marginBottom: 14 }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong>{r.name}</strong>
                  <span className="row">
                    <span className="sub" style={{ margin: 0 }}>
                      {t("{a}/{b} · {n} prospectos", { a: r.mapped, b: r.total, n: r.prospects })}
                    </span>
                    <Badge status={r.status} />
                  </span>
                </div>
                <div className="progress" style={{ marginTop: 6 }}>
                  <div style={{ width: `${r.total ? (100 * r.mapped) / r.total : 0}%` }} />
                </div>
              </div>
            ))
          )}
        </div>

        <div className="card">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
            <h2 style={{ margin: 0 }}>{t("Últimas ejecuciones")}</h2>
            <Link href="/agentes">{t("Ver todo")}</Link>
          </div>
          {jobs.length === 0 ? (
            <div className="empty">{t("Sin ejecuciones todavía.")}</div>
          ) : (
            <table>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id}>
                    <td>
                      {t(JOB_LABEL[j.type] ?? j.type)}
                      {j.last_error && <div className="help" style={{ color: "var(--err)" }}>{j.last_error.slice(0, 120)}</div>}
                    </td>
                    <td><Badge status={j.status} /></td>
                    <td className="sub">{fmtDate(j.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
