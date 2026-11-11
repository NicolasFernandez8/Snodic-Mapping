/**
 * IA local (modelos chicos): en vez de pedir el texto final, se usa el MISMO prompt de Snodic
 * (análisis y reglas) y se le pide al modelo que devuelva solo los huecos de la plantilla en JSON
 * con formato obligatorio. La app arma el texto con la plantilla exacta de Snodic, así nunca faltan
 * el "Hola!", la etapa gratuita, la pregunta de cierre ni la estructura de 7 pasos del informe.
 * Los prompts originales (prompts.ts) no se modifican.
 */
import { messagePrompt, reportPrompt, type PromptInput } from "./prompts";
import { validateMessage, validateReport } from "./validate";

export const LOCAL_FORMAT_VERSION = "2026-11-11.1";

export type JsonLlm = { completeJson(prompt: string, schema: object, maxTokens: number, temperature?: number): Promise<{ data: unknown; model: string }> };

const SLOT_RULES = `- Español de España (vosotros), frases cortas y concretas, como las escribiría una persona.
- Basado SOLO en las reseñas de arriba: no inventes datos.
- No menciones el nombre del local.
- No uses "mejorar la experiencia" ni "optimizar procesos".
- Nada de corchetes, comillas ni marcadores.`;

export function localMessagePrompt(input: PromptInput): string {
  return `${messagePrompt(input)}

---

⚙️ FORMATO DE ESTA RESPUESTA (reemplaza al anterior):
NO escribas el mensaje. Devolvé SOLO un JSON con el texto que va en cada hueco de la plantilla:
- "positivos": lo que va en [COSAS POSITIVAS] (1–2 aspectos positivos que se repiten), empezando en minúscula. Ej: "destacan mucho la limpieza y la amabilidad del personal"
- "problema": lo que va en [PROBLEMA DETECTADO] (1 problema que se repite), empezando en minúscula. Ej: "varios comentan que cuesta mucho reservar por teléfono"
- "solucion": lo que va en [SOLUCIÓN EN 1 LÍNEA], empezando en minúscula. Ej: "responder las reservas al instante por WhatsApp"
- "beneficio": lo que va en [BENEFICIO EN 1 LÍNEA], empezando en minúscula. Ej: "no perder reservas fuera de horario"
Reglas de los huecos:
${SLOT_RULES}
- Sin punto final.`;
}

export function localReportPrompt(input: PromptInput): string {
  return `${reportPrompt(input)}

---

⚙️ FORMATO DE ESTA RESPUESTA (reemplaza al anterior):
Devolvé SOLO un JSON con "ideas": una lista de EXACTAMENTE 2 ideas distintas. Cada idea tiene los 7 pasos como texto:
"problema", "solucion", "impacto", "clave", "implementacion", "como_venderlo", "como_medir".
Reglas:
${SLOT_RULES}
- Cada campo con 1–2 frases (en "como_medir", 1–2 métricas antes vs después).`;
}

const str = { type: "string" };
const MESSAGE_SCHEMA = {
  type: "object",
  properties: { positivos: str, problema: str, solucion: str, beneficio: str },
  required: ["positivos", "problema", "solucion", "beneficio"],
};
const IDEA = {
  type: "object",
  properties: { problema: str, solucion: str, impacto: str, clave: str, implementacion: str, como_venderlo: str, como_medir: str },
  required: ["problema", "solucion", "impacto", "clave", "implementacion", "como_venderlo", "como_medir"],
};
const REPORT_SCHEMA = { type: "object", properties: { ideas: { type: "array", items: IDEA, minItems: 2, maxItems: 2 } }, required: ["ideas"] };

/** Limpia un hueco: sin comillas, corchetes, punto final ni mayúscula inicial (va en medio de una frase). */
export function slot(v: unknown, lowerFirst = true): string {
  let s = String(v ?? "").replace(/[\[\]"“”«»]/g, "").replace(/\s+/g, " ").trim().replace(/[.;:,]+$/, "");
  if (lowerFirst && s && !/^[A-ZÁÉÍÓÚÑ]{2}/.test(s)) s = s.charAt(0).toLowerCase() + s.slice(1);
  return s;
}

const para = (v: unknown) => {
  const s = String(v ?? "").replace(/[\[\]]/g, "").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "-";
};

/** Plantilla exacta del mensaje de Snodic con los huecos completados. */
export function assembleMessage(d: Record<string, unknown>, businessLabel: string): string {
  return `Hola!

Estuve viendo sus reseñas y ${slot(d.positivos)}. También vi que ${slot(d.problema)}.

Me llamo Nico y justamente me especializo en ${slot(d.solucion)}, para ${slot(d.beneficio)}.

En una primera etapa sería totalmente gratuito para vosotros. La idea es analizar vuestro caso, ver si podemos aportar algo de valor.

Estoy trabajando ahora con algunos ${businessLabel} en esto para documentar resultados en este tipo de locales y me dijeron que me comunique con ustedes pero no me dijeron con quien. Con quien podría hablar del tema?`;
}

/** Estructura exacta del informe (IDEA 1 / IDEA 2 con los 7 pasos). */
export function assembleReport(d: { ideas?: Record<string, unknown>[] }): string {
  return (d.ideas ?? [])
    .slice(0, 2)
    .map(
      (i, n) => `IDEA ${n + 1}
Problema:
${para(i.problema)}
Solución:
${para(i.solucion)}
Impacto:
${para(i.impacto)}
Clave:
${para(i.clave)}
Implementación:
${para(i.implementacion)}
Cómo venderlo:
${para(i.como_venderlo)}
Cómo medir resultados:
${para(i.como_medir)}`,
    )
    .join("\n\n");
}

/** Genera con huecos + plantilla; si quedan observaciones reintenta y se queda con la mejor versión. */
export async function generateLocal(
  kind: "message" | "report",
  input: PromptInput,
  llm: JsonLlm,
): Promise<{ text: string; model: string; prompt: string; issues: string[] }> {
  const prompt = kind === "message" ? localMessagePrompt(input) : localReportPrompt(input);
  let best: { text: string; model: string; issues: string[] } | null = null;
  for (const temperature of [0.4, 0.2, 0.7]) {
    const { data, model } = await llm.completeJson(prompt, kind === "message" ? MESSAGE_SCHEMA : REPORT_SCHEMA, kind === "message" ? 500 : 2200, temperature);
    const d = (data ?? {}) as Record<string, unknown>;
    const text = kind === "message" ? assembleMessage(d, input.businessLabel) : assembleReport(d as { ideas?: Record<string, unknown>[] });
    const issues = kind === "message" ? validateMessage(text, input.name) : validateReport(text);
    if (kind === "message" && [d.positivos, d.problema, d.solucion, d.beneficio].some((x) => slot(x).length < 4)) issues.push("Algún hueco quedó vacío");
    if (!best || issues.length < best.issues.length) best = { text, model, issues };
    if (!issues.length) break;
  }
  return { ...best!, prompt };
}
