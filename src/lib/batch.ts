/**
 * Prompts en lote para el modo manual: un solo texto para pegar en tu app de Claude con varios prospectos,
 * y el parser que separa la respuesta y la guarda en cada ficha.
 */
import { q } from "./db";
import { messagePrompt, reportPrompt } from "./ai/prompts";
import { promptInput, saveManualOutput, type OutputKind } from "./agents/agent34-writer";

export type BatchItem = { id: number; name: string; score: number | null; reviews: number };

/** Prospectos que necesitan mensaje (o informe), con reseñas cargadas, por puntaje. */
export async function batchCandidates(kind: OutputKind, limit: number): Promise<BatchItem[]> {
  const needs =
    kind === "message"
      ? `NOT EXISTS (SELECT 1 FROM outputs o WHERE o.prospect_id = p.id AND o.kind = 'message' AND o.content IS NOT NULL)`
      : `EXISTS (SELECT 1 FROM outputs o WHERE o.prospect_id = p.id AND o.kind = 'message' AND o.content IS NOT NULL)
         AND NOT EXISTS (SELECT 1 FROM outputs o WHERE o.prospect_id = p.id AND o.kind = 'report' AND o.content IS NOT NULL)`;
  return q<BatchItem>(
    `SELECT p.id, p.name, p.score, (SELECT count(*)::int FROM reviews r WHERE r.prospect_id = p.id) AS reviews
     FROM prospects p
     WHERE p.status <> 'discarded' AND NOT p.do_not_contact AND p.duplicate_of IS NULL
       AND EXISTS (SELECT 1 FROM reviews r WHERE r.prospect_id = p.id) AND ${needs}
     ORDER BY p.score DESC NULLS LAST, p.id LIMIT $1`,
    [limit],
  );
}

export async function buildBatchPrompt(kind: OutputKind, ids: number[]): Promise<string> {
  const parts: string[] = [];
  for (const id of ids) {
    const input = await promptInput(id);
    const prompt = kind === "message" ? messagePrompt(input) : reportPrompt(input);
    parts.push(`===TAREA ${id}===\n${prompt}\n===FIN TAREA ${id}===`);
  }
  const what = kind === "message" ? "un mensaje de WhatsApp" : "un informe con EXACTAMENTE 2 ideas";
  return `Vas a resolver ${ids.length} tareas independientes. Cada una es ${what} para un local distinto y tiene sus propias reseñas e instrucciones.
Resolvé cada tarea por separado, sin mezclar información entre locales, respetando TODAS las reglas de cada una.

FORMATO DE RESPUESTA OBLIGATORIO (para que el sistema pueda separar los resultados):
${ids.map((id) => `===RESPUESTA ${id}===\n(resultado de la tarea ${id})\n===FIN ${id}===`).join("\n")}

No agregues nada fuera de esos bloques.

${parts.join("\n\n")}`;
}

/** Separa la respuesta pegada en resultados por id. */
export function parseBatchResponse(text: string): Map<number, string> {
  const out = new Map<number, string>();
  const re = /===\s*RESPUESTA\s+(\d+)\s*===\s*([\s\S]*?)\s*===\s*FIN\s+\1\s*===/g;
  for (const m of text.matchAll(re)) {
    const body = m[2].trim();
    if (body) out.set(Number(m[1]), body);
  }
  return out;
}

/** Guarda cada resultado como revisión humana. Devuelve guardados y los ids que faltaron. */
export async function saveBatch(kind: OutputKind, ids: number[], text: string) {
  const parsed = parseBatchResponse(text);
  const saved: number[] = [];
  const missing: number[] = [];
  for (const id of ids) {
    const body = parsed.get(id);
    if (!body) {
      missing.push(id);
      continue;
    }
    await saveManualOutput(id, kind, body);
    saved.push(id);
  }
  return { saved, missing };
}
