/**
 * Proveedor de IA de los agentes 3 y 4.
 * - "anthropic": usa la API de Anthropic con ANTHROPIC_API_KEY (pago por uso: lo activa el usuario).
 * - "manual": no llama a ninguna IA; deja el prompt listo para copiar desde la UI.
 */
import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";

export type LlmResult =
  | { mode: "anthropic"; text: string; model: string }
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

export function llmFromConfig(): Llm {
  const cfg = config();
  if (cfg.LLM_PROVIDER === "anthropic") {
    if (!cfg.ANTHROPIC_API_KEY) throw new Error("LLM_PROVIDER=anthropic pero falta ANTHROPIC_API_KEY");
    return new AnthropicLlm(cfg.ANTHROPIC_API_KEY, cfg.ANTHROPIC_MODEL);
  }
  return new ManualLlm();
}
