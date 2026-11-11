/**
 * Proveedor de IA de los agentes 3 y 4.
 * - "manual": no llama a ninguna IA; deja el prompt listo para copiar desde la UI (por defecto).
 * - "ollama": IA local y gratuita en la PC de Snodic (Ollama). Los datos no salen de la computadora.
 * - "anthropic": API de Anthropic (pago por uso: NO USAR, Snodic trabaja a costo cero).
 * El modo se elige en Ajustes (setting "ai_mode"); si no está, se usa LLM_PROVIDER del .env.
 */
import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";
import { gpu } from "../limits";

export type LlmResult =
  | { mode: "anthropic" | "ollama"; text: string; model: string }
  | { mode: "manual" };

export interface Llm {
  complete(prompt: string, maxTokens: number): Promise<LlmResult>;
}

export class ManualLlm implements Llm {
  async complete(): Promise<LlmResult> {
    return { mode: "manual" };
  }
}

export class AnthropicLlm implements Llm {
  private client: Anthropic;
  constructor(
    apiKey: string,
    private model: string,
  ) {
    this.client = new Anthropic({ apiKey });
  }
  async complete(prompt: string, maxTokens: number): Promise<LlmResult> {
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    });
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return { mode: "anthropic", text, model: this.model };
  }
}

/** IA local con Ollama (http://localhost:11434). Sin claves ni costos. */
export class OllamaLlm implements Llm {
  constructor(
    private baseUrl: string,
    private model: string,
    private fetchImpl: typeof fetch = fetch,
    private numCtx = 8192,
  ) {}
  async complete(prompt: string, maxTokens: number): Promise<LlmResult> {
    return gpu.run(() => this.completeNow(prompt, maxTokens));
  }

  private async completeNow(prompt: string, maxTokens: number): Promise<LlmResult> {
    const res = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        messages: [{ role: "user", content: prompt }],
        options: { temperature: 0.5, num_ctx: this.numCtx, num_predict: maxTokens },
      }),
      signal: AbortSignal.timeout(10 * 60_000),
    });
    if (!res.ok) throw new Error(`Ollama respondió ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = (await res.json()) as { message?: { content?: string } };
    // Algunos modelos piensan "en voz alta" entre <think>…</think>: se descarta.
    const text = (j.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    if (!text) throw new Error("Ollama devolvió una respuesta vacía");
    return { mode: "ollama", text, model: `ollama:${this.model}` };
  }

  /** Respuesta con formato obligatorio (JSON Schema): Ollama garantiza que respete los campos. */
  async completeJson(prompt: string, schema: object, maxTokens: number, temperature = 0.4): Promise<{ data: unknown; model: string }> {
    return gpu.run(() => this.completeJsonNow(prompt, schema, maxTokens, temperature));
  }

  private async completeJsonNow(prompt: string, schema: object, maxTokens: number, temperature: number): Promise<{ data: unknown; model: string }> {
    const res = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        format: schema,
        messages: [{ role: "user", content: prompt }],
        options: { temperature, num_ctx: this.numCtx, num_predict: maxTokens },
      }),
      signal: AbortSignal.timeout(10 * 60_000),
    });
    if (!res.ok) throw new Error(`Ollama respondió ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = (await res.json()) as { message?: { content?: string } };
    const raw = (j.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    try {
      return { data: JSON.parse(raw), model: `ollama:${this.model}` };
    } catch {
      throw new Error("Ollama no devolvió un JSON válido");
    }
  }
}

export type AiMode = "manual" | "ollama" | "anthropic";

/** Estado de la IA local: si Ollama responde y si el modelo está descargado. */
export async function ollamaStatus(fetchImpl: typeof fetch = fetch): Promise<{ reachable: boolean; hasModel: boolean; model: string; url: string; models: string[] }> {
  const cfg = config();
  const url = cfg.OLLAMA_URL, model = cfg.OLLAMA_MODEL;
  try {
    const res = await fetchImpl(`${url.replace(/\/$/, "")}/api/tags`, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return { reachable: false, hasModel: false, model, url, models: [] };
    const j = (await res.json()) as { models?: { name: string }[] };
    const models = (j.models ?? []).map((m) => m.name);
    const base = model.includes(":") ? model : `${model}:latest`;
    return { reachable: true, hasModel: models.some((m) => m === model || m === base), model, url, models };
  } catch {
    return { reachable: false, hasModel: false, model, url, models: [] };
  }
}

/** IA a usar según Ajustes (ai_mode) o, si no hay, el .env. */
export async function getLlm(): Promise<Llm> {
  const { getSetting } = await import("../db");
  const mode = await getSetting<AiMode | null>("ai_mode", null);
  const cfg = config();
  if (mode === "ollama" || (!mode && cfg.LLM_PROVIDER === "ollama")) return new OllamaLlm(cfg.OLLAMA_URL, cfg.OLLAMA_MODEL, fetch, cfg.OLLAMA_NUM_CTX);
  if (mode === "manual") return new ManualLlm();
  return llmFromConfig();
}

export async function aiMode(): Promise<AiMode> {
  const { getSetting } = await import("../db");
  const mode = await getSetting<AiMode | null>("ai_mode", null);
  return mode ?? (config().LLM_PROVIDER as AiMode);
}

export function llmFromConfig(): Llm {
  const cfg = config();
  if (cfg.LLM_PROVIDER === "anthropic") {
    if (!cfg.ANTHROPIC_API_KEY) throw new Error("LLM_PROVIDER=anthropic pero falta ANTHROPIC_API_KEY");
    return new AnthropicLlm(cfg.ANTHROPIC_API_KEY, cfg.ANTHROPIC_MODEL);
  }
  if (cfg.LLM_PROVIDER === "ollama") return new OllamaLlm(cfg.OLLAMA_URL, cfg.OLLAMA_MODEL, fetch, cfg.OLLAMA_NUM_CTX);
  return new ManualLlm();
}
