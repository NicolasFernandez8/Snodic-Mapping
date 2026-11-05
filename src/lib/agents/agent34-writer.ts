/**
 * AGENTE 3 — Mensaje de WhatsApp personalizado a partir de las reseñas.
 * AGENTE 4 — Informe con 2 ideas de soluciones informáticas a partir de las reseñas.
 *
 * Ambos escriben en el cuerpo de la página de Notion del prospecto:
 *   [mensaje del agente 3]
 *   (2 párrafos vacíos)
 *   [informe del agente 4]
 */
import { one, q } from "../db";
import { messagePrompt, reportPrompt, type PromptInput } from "../ai/prompts";
import { validateMessage, validateReport } from "../ai/validate";
import type { Llm } from "../ai/llm";
import { NotionClient, paragraphs } from "../notion";
import { PROSPECT_COLUMNS, reviewsLink } from "./agent2-collector";
import type { AgentLog, ProspectRow } from "./types";

export type OutputKind = "message" | "report";

export type OutputRow = {
  id: number;
  prospect_id: number;
  kind: OutputKind;
  status: "ready" | "needs_review" | "pending_manual" | "failed";
  content: string | null;
  prompt: string;
  model: string | null;
  issues: string[];
  created_at: string;
};

export async function promptInput(prospectId: number): Promise<PromptInput & { prospect: ProspectRow }> {
  const p = await one<ProspectRow & { business_label: string | null }>(
    `SELECT ${PROSPECT_COLUMNS}, n.business_label FROM prospects p LEFT JOIN niches n ON n.key = p.niche_key WHERE p.id = $1`,
    [prospectId],
  );
  if (!p) throw new Error(`Prospecto ${prospectId} inexistente`);
  const reviews = await q<{ rating: number | null; text: string }>(
    "SELECT rating, text FROM reviews WHERE prospect_id = $1 ORDER BY published_at DESC NULLS LAST, id",
    [prospectId],
  );
  return {
    prospect: p,
    name: p.name,
    reviewsUrl: reviewsLink(p),
    businessLabel: p.business_label ?? "negocios",
    reviews,
  };
}

/** Limpia la respuesta del modelo (markdown y comillas sobrantes). */
export function cleanOutput(text: string): string {
  return text
    .replace(/^```[a-z]*\n?|```$/gm, "")
    .replace(/\*\*/g, "")
    .replace(/^"|"$/g, "")
    .trim();
}

export async function latestOutput(prospectId: number, kind: OutputKind) {
  return one<OutputRow>(
    "SELECT * FROM outputs WHERE prospect_id = $1 AND kind = $2 ORDER BY created_at DESC, id DESC LIMIT 1",
    [prospectId, kind],
  );
}

async function storeOutput(
  prospectId: number,
  kind: OutputKind,
  status: OutputRow["status"],
  prompt: string,
  content: string | null,
  model: string | null,
  issues: string[],
) {
  return one<OutputRow>(
    `INSERT INTO outputs (prospect_id, kind, status, content, prompt, model, issues)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING *`,
    [prospectId, kind, status, content, prompt, model, JSON.stringify(issues)],
  );
}

export async function generateOutput(prospectId: number, kind: OutputKind, llm: Llm) {
  const input = await promptInput(prospectId);
  const prompt = kind === "message" ? messagePrompt(input) : reportPrompt(input);
  if (!input.reviews.length) {
    return storeOutput(prospectId, kind, "needs_review", prompt, null, null, [
      "Sin reseñas disponibles: completar a mano o cargar reseñas",
    ]);
  }
  try {
    const res = await llm.complete(prompt, kind === "message" ? 600 : 2000);
    if (res.mode === "manual") return storeOutput(prospectId, kind, "pending_manual", prompt, null, null, []);
    const content = cleanOutput(res.text);
    const issues = kind === "message" ? validateMessage(content, input.name) : validateReport(content);
    return storeOutput(prospectId, kind, issues.length ? "needs_review" : "ready", prompt, content, res.model, issues);
  } catch (e) {
    return storeOutput(prospectId, kind, "failed", prompt, null, null, [(e as Error).message]);
  }
}

/** Guarda una salida pegada a mano (modo manual o corrección humana). */
export async function saveManualOutput(prospectId: number, kind: OutputKind, content: string) {
  const input = await promptInput(prospectId);
  const prompt = kind === "message" ? messagePrompt(input) : reportPrompt(input);
  const clean = cleanOutput(content);
  const issues = kind === "message" ? validateMessage(clean, input.name) : validateReport(clean);
  // La revisión humana es la que manda: queda "ready" y las observaciones se guardan como aviso.
  const out = await storeOutput(prospectId, kind, "ready", prompt, clean, "manual", issues);
  await advanceStatus(prospectId);
  return out;
}

/** Recalcula el estado del prospecto según sus salidas vigentes. */
export async function advanceStatus(prospectId: number) {
  const msg = await latestOutput(prospectId, "message");
  const rep = await latestOutput(prospectId, "report");
  const has = (o: OutputRow | null) => !!o && (o.status === "ready" || o.status === "needs_review") && !!o.content;
  const status = has(msg) && has(rep) ? "report_ready" : has(msg) ? "message_ready" : "enriched";
  await q(
    `UPDATE prospects SET status = $2, updated_at = now() WHERE id = $1 AND status NOT IN ('discarded') AND status <> $2`,
    [prospectId, status],
  );
  return status;
}

export async function runWriterAgent(
  kind: OutputKind,
  llm: Llm,
  limit = 20,
  log: AgentLog = () => {},
): Promise<{ processed: number } & Partial<Record<OutputRow["status"], number>>> {
  const fromStatus = kind === "message" ? "enriched" : "message_ready";
  const rows = await q<{ id: number; name: string }>(
    `SELECT p.id, p.name FROM prospects p
     WHERE p.status = $1 AND NOT EXISTS (
       SELECT 1 FROM outputs o WHERE o.prospect_id = p.id AND o.kind = $2 AND o.status IN ('ready','needs_review','pending_manual'))
     ORDER BY p.id LIMIT $3`,
    [fromStatus, kind, limit],
  );
  const counts: Partial<Record<OutputRow["status"], number>> = {};
  for (const r of rows) {
    const out = await generateOutput(r.id, kind, llm);
    counts[out!.status] = (counts[out!.status] ?? 0) + 1;
    await advanceStatus(r.id);
  }
  log(`Agente ${kind === "message" ? 3 : 4}: ${rows.length} prospectos → ${JSON.stringify(counts)}`);
  return { processed: rows.length, ...counts };
}

/** Escribe (o reescribe) mensaje + 2 espacios + informe en el cuerpo de la página de Notion. */
export async function writeBodyToNotion(prospectId: number, notion: NotionClient) {
  const p = await one<{ notion_page_id: string | null; notion_blocks: { message?: string[]; report?: string[] } }>(
    "SELECT notion_page_id, notion_blocks FROM prospects WHERE id = $1",
    [prospectId],
  );
  if (!p?.notion_page_id) return { written: false, reason: "sin página en Notion" };
  const msg = await latestOutput(prospectId, "message");
  const rep = await latestOutput(prospectId, "report");
  const old = [...(p.notion_blocks.message ?? []), ...(p.notion_blocks.report ?? [])];
  if (old.length) await notion.deleteBlocks(old);
  const blocks: { message?: string[]; report?: string[] } = {};
  if (msg?.content) blocks.message = await notion.appendBlocks(p.notion_page_id, paragraphs(msg.content));
  if (rep?.content) blocks.report = await notion.appendBlocks(p.notion_page_id, paragraphs(`\n\n${rep.content}`));
  await q(
    "UPDATE prospects SET notion_blocks = $2::jsonb, status = CASE WHEN $3 THEN 'synced' ELSE status END WHERE id = $1",
    [prospectId, JSON.stringify(blocks), !!(msg?.content && rep?.content)],
  );
  return { written: true };
}

export async function syncBodiesToNotion(limit = 50, log: AgentLog = () => {}, notion = NotionClient.fromConfig()) {
  if (!notion) return { written: 0, skipped: true };
  const rows = await q<{ id: number; name: string }>(
    `SELECT id, name FROM prospects WHERE notion_page_id IS NOT NULL AND status = 'report_ready'
     ORDER BY id LIMIT $1`,
    [limit],
  );
  let written = 0;
  for (const r of rows) {
    try {
      if ((await writeBodyToNotion(r.id, notion)).written) written++;
    } catch (e) {
      log(`${r.name}: ${(e as Error).message}`);
    }
  }
  log(`${written} páginas de Notion actualizadas con mensaje/informe`);
  return { written };
}
