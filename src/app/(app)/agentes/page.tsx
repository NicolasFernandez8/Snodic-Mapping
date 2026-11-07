import { getT } from "@/lib/i18n/server";
import { q } from "@/lib/db";
import { config } from "@/lib/config";
import { runAgent } from "@/app/actions";
import { MapAmount } from "@/app/map-amount";
import { getSetting } from "@/lib/db";
import { AutoRefresh } from "@/app/auto-refresh";
import { Badge, fmtDate, JOB_LABEL } from "@/app/ui";

export const dynamic = "force-dynamic";

type Task = { title: string; type: string; desc: string; link?: string };
type Folder = { n: number; role: string; tasks: Task[] };

/** Carpetas por agente: cada agente agrupa las tareas que él ejecuta. */
const FOLDERS: Folder[] = [
  {
    n: 1,
    role: "Mapeo de zonas",
    tasks: [
      {
        title: "Mapeo automático",
        type: "map_localities",
        desc: "Recorre las próximas localidades pendientes (de la más cercana al centro hacia afuera) y descubre prospectos del rubro dentro de cada polígono.",
      },
      {
        title: "Importar región",
        type: "import_region",
        desc: "Divide una provincia o ciudad en localidades (OpenStreetMap) o importa sectores propios desde un KML de My Maps.",
        link: "/ajustes#region",
      },
    ],
  },
  {
    n: 2,
    role: "Recopilación de datos",
    tasks: [
      {
        title: "Recopilación de datos",
        type: "collect_data",
        desc: "Completa teléfono, web, link de Google Maps y puntaje con datos abiertos. Lo que no encuentra queda como “-”.",
      },
      {
        title: "Datos abiertos",
        type: "enrich_open",
        desc: "Completa web, redes y cadena con Wikidata, y direcciones faltantes con OpenStreetMap (APIs oficiales y gratuitas).",
      },
    ],
  },
  {
    n: 3,
    role: "Mensajes de WhatsApp",
    tasks: [
      {
        title: "Mensaje de WhatsApp",
        type: "generate_messages",
        desc: "Analiza reseñas y redacta el mensaje personalizado (máx. 4 oraciones, español de España).",
      },
    ],
  },
  {
    n: 4,
    role: "Informes de oportunidades",
    tasks: [
      {
        title: "Informe de oportunidades",
        type: "generate_reports",
        desc: "Genera EXACTAMENTE 2 ideas vendibles con el framework de 7 pasos.",
      },
    ],
  },
  {
    n: 5,
    role: "Mantenimiento",
    tasks: [
      {
        title: "Buscar duplicados",
        type: "dedupe",
        desc: "Marca como duplicados los prospectos repetidos (mismo teléfono, o mismo nombre a menos de 150 m). Se queda el más completo.",
      },
      {
        title: "Recalcular puntajes",
        type: "rescore",
        desc: "Vuelve a calcular el puntaje de todos los prospectos (en bloques).",
      },
    ],
  },
  {
    n: 6,
    role: "Detector de WhatsApp",
    tasks: [
      {
        title: "Detectar WhatsApp",
        type: "classify_phones",
        desc: "Marca cada teléfono como móvil (6/7: probable WhatsApp) o fijo (8/9: sin WhatsApp). Los móviles se priorizan en Pipeline, Revisión rápida y el puntaje.",
      },
    ],
  },
  {
    n: 7,
    role: "Priorizador diario",
    tasks: [
      {
        title: "Prospectos del día",
        type: "daily_digest",
        desc: "Arma la lista 'Hoy contactá' (seguimientos que vencen, aperturas nuevas y mejores puntajes con WhatsApp) y la envía a n8n.",
      },
    ],
  },
  {
    n: 8,
    role: "Vigilante de aperturas",
    tasks: [
      {
        title: "Vigilar aperturas",
        type: "watch_openings",
        desc: "Vuelve a revisar las localidades mapeadas hace más de 30 días y marca los alojamientos nuevos con puntaje extra.",
      },
    ],
  },
  {
    n: 9,
    role: "Canal alternativo",
    tasks: [
      {
        title: "Email e Instagram",
        type: "alt_channel",
        desc: "En la ficha, si no hay móvil, ofrece enviar el mensaje por email (con línea de baja) o por mensaje directo de Instagram.",
        link: "/prospectos",
      },
    ],
  },
  {
    n: 10,
    role: "Asistente de respuestas",
    tasks: [
      {
        title: "Responder a prospectos",
        type: "reply_assistant",
        desc: "En la ficha, pegás lo que te respondieron y te arma el prompt para tu app de Claude, más respuestas listas a las objeciones típicas.",
        link: "/prospectos",
      },
    ],
  },
  {
    n: 11,
    role: "Reactivador",
    tasks: [
      {
        title: "Reactivar prospectos",
        type: "reactivate",
        desc: "A los 75 días sin respuesta propone un nuevo intento con otro enfoque (respeta la lista de no contactar).",
        link: "/seguimientos#reactivar",
      },
    ],
  },
  {
    n: 12,
    role: "Calendario de temporada",
    tasks: [
      {
        title: "Feriados y temporada",
        type: "season",
        desc: "Carga feriados oficiales (Nager.Date) y fechas fuertes de Alicante, y avisa cuándo conviene contactar antes de la temporada alta.",
      },
    ],
  },
];

export default async function Agentes() {
  const t = await getT();
  const cfg = config();
  const quota = await getSetting<number>("daily_locality_quota", 3);
  const lastRuns = await q<{ type: string; status: string; created_at: string }>(
    "SELECT DISTINCT ON (type) type, status, created_at FROM jobs ORDER BY type, id DESC",
  );
  const lastByType = new Map(lastRuns.map((r) => [r.type, r]));
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

      <div className="folders">
        {FOLDERS.map((f) => (
          <details key={f.n} id={`agente-${f.n}`} className="folder card" open>
            <summary>
              <span className="folder-ico" aria-hidden>▸</span>
              <strong className="folder-title">{t("Agente")} {f.n}</strong>
              <span className="help">{t(f.role)}</span>
              <span className="badge muted" style={{ marginLeft: "auto" }}>
                {f.tasks.length === 1 ? t("1 tarea") : t("{n} tareas", { n: f.tasks.length })}
              </span>
            </summary>
            <div className="folder-tasks">
              {f.tasks.map((a) => {
                const last = lastByType.get(a.type);
                return (
                  <form key={a.type} action={runAgent} className="task">
                    <strong>{t(a.title)}</strong>
                    <span className="sub" style={{ margin: 0, flex: 1 }}>{t(a.desc)}</span>
                    {last && (
                      <span className="help">
                        {t("Última ejecución:")} <Badge status={last.status} /> {fmtDate(last.created_at)}
                      </span>
                    )}
                    <input type="hidden" name="type" value={a.type} />
                    {a.type === "map_localities" && <MapAmount defaultLocalities={quota} compact />}
                    {a.link ? (
                      <a className="btn secondary sm" href={a.link}>{a.link.startsWith("/ajustes") ? t("Ir a Ajustes") : t("Abrir")}</a>
                    ) : (
                      <button className="btn sm">{t("Ejecutar")}</button>
                    )}
                  </form>
                );
              })}
            </div>
          </details>
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
