import { getT } from "@/lib/i18n/server";
import { q } from "@/lib/db";
import { config } from "@/lib/config";
import { runAgent } from "@/app/actions";
import { QuotaSlider } from "@/app/quota-slider";
import { getSetting } from "@/lib/db";
import { AutoRefresh } from "@/app/auto-refresh";
import { Badge, fmtDate, JOB_LABEL } from "@/app/ui";

export const dynamic = "force-dynamic";

const AGENTS = [
  {
    n: 1,
    title: "Mapeo automático",
    type: "map_localities",
    desc: "Recorre las próximas localidades pendientes (de la más cercana al centro hacia afuera) y descubre prospectos del rubro dentro de cada polígono.",
  },
  {
    n: 2,
    title: "Recopilación de datos",
    type: "collect_data",
    desc: "Completa teléfono, web, enlace de reseñas y reseñas por API oficial. Lo que no encuentra queda como “-”.",
  },
  {
    n: 0,
    title: "Buscar duplicados",
    type: "dedupe",
    desc: "Marca como duplicados los prospectos repetidos (mismo teléfono, o mismo nombre a menos de 150 m). Se queda el más completo.",
  },
  {
    n: 0,
    title: "Recalcular puntajes",
    type: "rescore",
    desc: "Vuelve a calcular el puntaje de todos los prospectos (en bloques).",
  },
  { n: 2, title: "Sincronizar Notion", type: "sync_notion", desc: "Crea/actualiza la ficha de cada prospecto y escribe mensaje + informe en el cuerpo." },
  {
    n: 3,
    title: "Mensaje de WhatsApp",
    type: "generate_messages",
    desc: "Analiza reseñas y redacta el mensaje personalizado (máx. 4 oraciones, español de España).",
  },
  {
    n: 4,
    title: "Informe de oportunidades",
    type: "generate_reports",
    desc: "Genera EXACTAMENTE 2 ideas vendibles con el framework de 7 pasos.",
  },
];

export default async function Agentes() {
  const t = await getT();
  const cfg = config();
  const quota = await getSetting<number>("daily_locality_quota", 3);
  const jobs = await q<{
    id: number;
    type: string;
    status: string;
    attempts: number;
    created_at: string;
    updated_at: string;
    last_error: string | null;
    result: { log?: string[] } | null;
  }>("SELECT id, type, status, attempts, created_at, updated_at, last_error, result FROM jobs ORDER BY id DESC LIMIT 40");

  const checks = [
    { ok: !!cfg.GOOGLE_MAPS_API_KEY, label: "Google Places API", hint: "GOOGLE_MAPS_API_KEY" },
    { ok: !!(cfg.NOTION_TOKEN && cfg.NOTION_DATABASE_ID), label: "Notion", hint: "NOTION_TOKEN + NOTION_DATABASE_ID" },
    {
      ok: cfg.LLM_PROVIDER === "anthropic" && !!cfg.ANTHROPIC_API_KEY,
      label: cfg.LLM_PROVIDER === "anthropic" ? `IA: ${cfg.ANTHROPIC_MODEL}` : "IA en modo manual",
      hint: "LLM_PROVIDER=anthropic + ANTHROPIC_API_KEY",
    },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t("Agentes")}</h1>
          <p className="sub">{t("El worker ejecuta la cola y corre el pipeline diario ({cron}, {tz}).", { cron: cfg.WORKER_CRON, tz: cfg.TZ })}</p>
        </div>
        <div className="row">
          <AutoRefresh active={jobs.some((j) => j.status === "queued" || j.status === "running")} />
          {checks.map((c) => (
            <span key={c.label} className={`badge ${c.ok ? "ok" : "warn"}`} title={c.hint}>
              {c.ok ? "✓" : "!"} {t(c.label)}
            </span>
          ))}
        </div>
      </div>

      <div className="grid kpis" style={{ marginBottom: 20 }}>
        {AGENTS.map((a) => (
          <form key={a.type} action={runAgent} className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span className="badge" style={{ alignSelf: "flex-start" }}>{a.n ? `${t("Agente")} ${a.n}` : t("Mantenimiento")}</span>
            <strong>{t(a.title)}</strong>
            <span className="sub" style={{ margin: 0, flex: 1 }}>{t(a.desc)}</span>
            <input type="hidden" name="type" value={a.type} />
            {a.type === "map_localities" && <QuotaSlider defaultValue={quota} />}
            <button className="btn sm">{t("Ejecutar")}</button>
          </form>
        ))}
      </div>

      <div className="card">
        <h2>{t("Historial")}</h2>
        {jobs.length === 0 ? (
          <div className="empty">{t("Sin ejecuciones.")}</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>#</th><th>{t("Trabajo")}</th><th>{t("Estado")}</th><th>{t("Creado")}</th><th>{t("Detalle")}</th></tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id}>
                    <td>{j.id}</td>
                    <td>{t(JOB_LABEL[j.type] ?? j.type)}</td>
                    <td><Badge status={j.status} />{j.attempts > 1 && <div className="help">{t("intento")}{" "}{j.attempts}</div>}</td>
                    <td className="sub">{fmtDate(j.created_at)}</td>
                    <td style={{ maxWidth: 520 }}>
                      {j.last_error && <div style={{ color: "var(--err)" }}>{j.last_error}</div>}
                      {j.result?.log?.length ? (
                        <details>
                          <summary>{t("{n} líneas de log", { n: j.result.log.length })}</summary>
                          <div className="pre">{j.result.log.join("\n")}</div>
                        </details>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
