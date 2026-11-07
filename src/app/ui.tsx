import { getT } from "@/lib/i18n/server";

export const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  new: { label: "Nuevo", tone: "muted" },
  enriched: { label: "Datos listos", tone: "" },
  message_ready: { label: "Mensaje listo", tone: "" },
  report_ready: { label: "Informe listo", tone: "warn" },
  synced: { label: "En Notion", tone: "ok" },
  discarded: { label: "Descartado", tone: "muted" },
  // localidades
  pending: { label: "Pendiente", tone: "muted" },
  mapping: { label: "Mapeando", tone: "warn" },
  mapped: { label: "Mapeada", tone: "ok" },
  partial: { label: "Parcial", tone: "warn" },
  failed: { label: "Error", tone: "err" },
  skipped: { label: "Omitida", tone: "muted" },
  // trabajos / salidas
  queued: { label: "En cola", tone: "muted" },
  running: { label: "Corriendo", tone: "warn" },
  done: { label: "Listo", tone: "ok" },
  ready: { label: "Listo", tone: "ok" },
  needs_review: { label: "Revisar", tone: "warn" },
  pending_manual: { label: "Manual", tone: "" },
  active: { label: "Activa", tone: "" },
  paused: { label: "Pausada", tone: "muted" },
};

export async function Badge({ status }: { status: string }) {
  const t = await getT();
  const s = STATUS_LABEL[status] ?? { label: status, tone: "muted" };
  return <span className={`badge ${s.tone}`}>{t(s.label)}</span>;
}

/** Muestra "-" para datos vacíos (convención de Snodic). */
export function V({ v, href }: { v: string | number | null | undefined; href?: boolean }) {
  if (v === null || v === undefined || v === "") return <span style={{ color: "var(--muted)" }}>-</span>;
  if (href) {
    const url = String(v);
    return (
      <a href={url} target="_blank" rel="noreferrer">
        {url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 48)}
      </a>
    );
  }
  return <>{v}</>;
}

export const JOB_LABEL: Record<string, string> = {
  import_region: "Agente 1 · Importar región",
  map_localities: "Agente 1 · Mapear localidades",
  collect_data: "Agente 2 · Recopilar datos",
  sync_notion: "Agente 2 · Sincronizar Notion",
  generate_messages: "Agente 3 · Mensajes",
  generate_reports: "Agente 4 · Informes",
  daily_pipeline: "Pipeline diario completo",
  rescore: "Agente 5 · Recalcular puntajes",
  dedupe: "Agente 5 · Buscar duplicados",
};

export function fmtDate(d: string | Date | null) {
  if (!d) return "-";
  return new Date(d).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Madrid" });
}
