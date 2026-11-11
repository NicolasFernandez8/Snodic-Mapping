import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  NOTION_TOKEN: z.string().optional(),
  NOTION_DATABASE_ID: z.string().optional(),
  NOTION_NUM_PROPERTY: z.string().optional(),
  /** JSON con el mapeo campo interno -> nombre de propiedad en Notion. */
  NOTION_PROPERTY_MAP: z.string().optional(),
  /** "anthropic" usa la API; "manual" deja el prompt listo para copiar. */
  LLM_PROVIDER: z.enum(["anthropic", "manual", "ollama"]).default("manual"),
  // IA local gratuita (Ollama). Desde Docker, la PC se alcanza como host.docker.internal.
  OLLAMA_URL: z.string().default("http://host.docker.internal:11434"),
  OLLAMA_MODEL: z.string().default("qwen2.5:7b"),
  // Memoria de contexto (tokens). 8192 entra un prompt con muchas reseñas + el informe completo.
  OLLAMA_NUM_CTX: z.coerce.number().int().min(2048).max(32768).default(8192),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-5-5"),
  OVERPASS_URL: z.string().default("https://overpass-api.de/api/interpreter"),
  APP_USER_AGENT: z.string().default("Snodic-Mapping/0.1"),
  WORKER_CRON: z.string().default("0 9 * * *"),
  TZ: z.string().default("Europe/Madrid"),
});

export type Config = z.infer<typeof schema>;

let cached: Config | null = null;

export function config(): Config {
  if (!cached) {
    // Las variables vacías se tratan como ausentes.
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([, v]) => v !== undefined && v !== ""),
    );
    cached = schema.parse(env);
  }
  return cached;
}

/** Solo para tests. */
export function resetConfig() {
  cached = null;
}
