/**
 * Mini-auditoría pública por prospecto: página /a/<código> con los hallazgos del Agente 4.
 * Se crea solo cuando una persona lo decide y se puede revocar. No muestra datos personales de reseñadores.
 */
import { randomBytes } from "node:crypto";
import { one, q } from "./db";
import { logActivity } from "./crm";
import { notify } from "./notify";

export type AuditIdea = { problem: string; solution: string; impact: string };

/** Extrae Problema / Solución / Impacto de cada IDEA del informe del Agente 4. */
export function parseReport(report: string): AuditIdea[] {
  const blocks = report.split(/^\s*IDEA\s+\d+\s*$/m).slice(1);
  const section = (b: string, name: string) => {
    const re = new RegExp(`${name}:\\s*\\n?([\\s\\S]*?)(?=\\n\\s*(Problema|Solución|Impacto|Clave|Implementación|Cómo venderlo|Cómo medir resultados):|$)`);
    return (re.exec(b)?.[1] ?? "").trim();
  };
  return blocks
    .map((b) => ({ problem: section(b, "Problema"), solution: section(b, "Solución"), impact: section(b, "Impacto") }))
    .filter((i) => i.problem && i.solution);
}

export async function createAudit(prospectId: number, userId: number) {
  const slug = randomBytes(6).toString("base64url");
  await q("UPDATE prospects SET audit_slug = COALESCE(audit_slug, $2) WHERE id = $1", [prospectId, slug]);
  await logActivity(prospectId, userId, "audit_created", { body: "Mini-auditoría publicada" });
  return (await one<{ audit_slug: string }>("SELECT audit_slug FROM prospects WHERE id = $1", [prospectId]))!.audit_slug;
}

export async function revokeAudit(prospectId: number, userId: number) {
  await q("UPDATE prospects SET audit_slug = NULL WHERE id = $1", [prospectId]);
  await logActivity(prospectId, userId, "note", { body: "Mini-auditoría despublicada" });
}

export async function auditBySlug(slug: string) {
  return one<{ id: number; name: string; category: string | null; locality: string | null; report: string | null }>(
    `SELECT p.id, p.name, p.category, l.name AS locality,
       (SELECT content FROM outputs o WHERE o.prospect_id = p.id AND o.kind = 'report' AND o.content IS NOT NULL
        ORDER BY created_at DESC, id DESC LIMIT 1) AS report
     FROM prospects p LEFT JOIN localities l ON l.id = p.locality_id WHERE p.audit_slug = $1`,
    [slug],
  );
}

/** Registra una visita (como máximo una cada 30 min para no inflar). */
export async function recordAuditView(prospectId: number, name: string) {
  const row = await one<{ counted: boolean }>(
    `UPDATE prospects SET audit_views = audit_views + 1, audit_last_viewed_at = now()
     WHERE id = $1 AND (audit_last_viewed_at IS NULL OR audit_last_viewed_at < now() - interval '30 minutes')
     RETURNING true AS counted`,
    [prospectId],
  );
  if (row?.counted) {
    await logActivity(prospectId, null, "audit_view", { body: "Abrieron la mini-auditoría" });
    void notify("audit_viewed", { prospect: name });
  }
}
