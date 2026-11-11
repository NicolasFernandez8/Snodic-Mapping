import { getT } from "@/lib/i18n/server";
import { requireUser } from "@/lib/auth/session";
import { getSetting, one, q } from "@/lib/db";
import { config } from "@/lib/config";
import { propertyMap } from "@/lib/notion";
import { notionJobAction, setNotionEnabledAction } from "@/app/notion-actions";
import { Badge, fmtDate, JOB_LABEL } from "@/app/ui";
import { AutoRefresh } from "@/app/auto-refresh";

export const dynamic = "force-dynamic";

/** Todo lo de Notion en un solo lugar. Apagado por defecto: sin el interruptor no se envía ni se lee nada. */
export default async function NotionPage({ searchParams }: { searchParams: Promise<{ off?: string }> }) {
  const t = await getT();
  const me = await requireUser();
  const sp = await searchParams;
  const cfg = config();
  const configured = !!(cfg.NOTION_TOKEN && cfg.NOTION_DATABASE_ID);
  const [enabled, stats, jobs] = await Promise.all([
    getSetting<boolean>("notion_enabled", false),
    one<{ synced: number; pending: number; bodies: number; last: string | null }>(
      `SELECT count(*) FILTER (WHERE notion_page_id IS NOT NULL)::int AS synced,
              count(*) FILTER (WHERE status IN ('enriched','message_ready','report_ready','synced')
                AND (notion_synced_at IS NULL OR notion_synced_at < updated_at))::int AS pending,
              count(*) FILTER (WHERE notion_page_id IS NOT NULL AND status = 'report_ready')::int AS bodies,
              max(notion_synced_at)::text AS last
       FROM prospects WHERE duplicate_of IS NULL`,
    ),
    q<{ id: number; type: string; status: string; created_at: string; last_error: string | null; result: { log?: string[] } | null }>(
      "SELECT id, type, status, created_at, last_error, result FROM jobs WHERE type IN ('sync_notion','notion_pull','notion_fix') ORDER BY id DESC LIMIT 20",
    ),
  ]);
  const busy = jobs.some((j) => j.status === "queued" || j.status === "running");
  const off = !enabled;
  const map = Object.entries(propertyMap());
  const Action = ({ kind, label, desc, primary }: { kind: string; label: string; desc: string; primary?: boolean }) => (
    <form action={notionJobAction} className="notion-action">
      <input type="hidden" name="kind" value={kind} />
      <div style={{ minWidth: 0 }}>
        <strong>{label}</strong>
        <div className="help" style={{ margin: 0 }}>{desc}</div>
      </div>
      <button className={`btn ${primary ? "" : "secondary"} sm`} disabled={off} title={off ? t("Notion está desactivado") : undefined}>
        {t("Ejecutar")}
      </button>
    </form>
  );

  return (
    <>
      <AutoRefresh active={busy} />
      <div className="page-head">
        <div>
          <h1>{t("Notion")}</h1>
          <p className="sub">{t("Enviar prospectos a tu base de Notion y traer cambios. Todo lo de Notion se maneja desde acá.")}</p>
        </div>
        <span className={`badge ${enabled ? "ok" : "muted"}`}>{enabled ? t("Activado") : t("Desactivado")}</span>
      </div>
      {sp.off && <div className="notice">{t("Notion está desactivado: no se envió ni se leyó nada.")}</div>}

      <div className="grid two" style={{ marginBottom: 16 }}>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>{t("Conexión")}</h2>
          <dl className="dl">
            <dt>{t("Interacción")}</dt>
            <dd>{enabled ? t("Activada") : t("Desactivada: todo queda solo en la app")}</dd>
            <dt>{t("Credenciales")}</dt>
            <dd>{configured ? t("Configuradas en el servidor") : t("Faltan NOTION_TOKEN y NOTION_DATABASE_ID en .env")}</dd>
            <dt>{t("Última sincronización")}</dt>
            <dd>{stats?.last ? fmtDate(stats.last) : "-"}</dd>
          </dl>
          {me.role === "admin" && (
            <form action={setNotionEnabledAction} style={{ marginTop: 12 }}>
              <input type="hidden" name="enabled" value={enabled ? "0" : "1"} />
              <button className={`btn ${enabled ? "danger" : ""} sm`} disabled={!enabled && !configured}>
                {enabled ? t("Desactivar Notion") : t("Activar Notion")}
              </button>
              {!enabled && !configured && <p className="help">{t("Para activarlo primero cargá las credenciales en el .env de la PC.")}</p>}
            </form>
          )}
          <p className="help">{t("Apagado: todo queda solo en la app (prospectos, mensajes e informes). Encendelo cuando quieras volcar a Notion; se envían también los acumulados.")}</p>
        </div>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>{t("Estado de los datos")}</h2>
          <div className="notion-stats">
            <div><span className="stat-n">{stats?.synced ?? 0}</span><span className="help">{t("con página en Notion")}</span></div>
            <div><span className="stat-n">{stats?.pending ?? 0}</span><span className="help">{t("pendientes de enviar")}</span></div>
            <div><span className="stat-n">{stats?.bodies ?? 0}</span><span className="help">{t("con mensaje + informe para escribir")}</span></div>
          </div>
        </div>
      </div>

      <div className="grid two" style={{ marginBottom: 16 }}>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>{t("Enviar a Notion")}</h2>
          <Action kind="all" primary label={t("Enviar todo")} desc={t("Crea o actualiza la ficha de cada prospecto y escribe mensaje + informe en el cuerpo.")} />
          <Action kind="props" label={t("Solo datos")} desc={t("Actualiza las columnas (teléfono, web, puntaje, localidad…) sin tocar el cuerpo.")} />
          <Action kind="bodies" label={t("Solo mensaje e informe")} desc={t("Escribe el mensaje y el informe en el cuerpo de las páginas que ya existen.")} />
          <Action kind="fix" label={t("Numerar y corregir")} desc={t("Pone Num a las filas que no lo tienen (sigue desde el último) y corrige Category, Area, State y redes de las filas que creó la app. Se hace solo después de cada envío.")} />
        </div>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>{t("Traer de Notion")}</h2>
          <Action kind="pull" label={t("Traer datos")} desc={t("Lee la base (sin modificarla): vincula páginas con prospectos por nombre y completa datos vacíos en la app. Nunca pisa lo que ya tiene la app.")} />
          <h2>{t("Columnas")}</h2>
          <div className="table-wrap">
            <table>
              <tbody>
                {map.map(([k, v]) => (
                  <tr key={k}><td className="help">{k}</td><td>{v}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="help">{t("Se cambian con NOTION_PROPERTY_MAP en el .env.")}</p>
        </div>
      </div>

      <div className="card table-wrap" style={{ padding: 0 }}>
        {jobs.length === 0 ? (
          <div className="empty">{t("Todavía no hubo envíos ni lecturas.")}</div>
        ) : (
          <table>
            <thead><tr><th>#</th><th>{t("Qué")}</th><th>{t("Estado")}</th><th>{t("Cuándo")}</th><th>{t("Detalle")}</th></tr></thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td>{j.id}</td>
                  <td>{t(JOB_LABEL[j.type] ?? j.type)}</td>
                  <td><Badge status={j.status} /></td>
                  <td>{fmtDate(j.created_at)}</td>
                  <td className="help">{j.last_error ?? j.result?.log?.slice(-1)[0] ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
