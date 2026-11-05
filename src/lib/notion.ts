/**
 * Cliente mínimo de la API oficial de Notion (https://developers.notion.com).
 * Requiere una integración interna (NOTION_TOKEN) compartida con la base de prospectos (NOTION_DATABASE_ID).
 *
 * Los nombres de las propiedades se configuran con NOTION_PROPERTY_MAP; el tipo de cada propiedad
 * se detecta leyendo el esquema de la base, así no hay que declararlo.
 * Los datos que no se encontraron se escriben como "-" (o vacío si el tipo no admite texto).
 */
import { config } from "./config";

const API = "https://api.notion.com/v1";
const VERSION = "2022-06-28";
export const EMPTY = "-";

/**
 * Campo interno -> nombre de la propiedad en la base de prospectos de Snodic.
 * "name" va a la propiedad de título (se detecta sola aunque se llame distinto).
 * No se tocan: Complete, ID, Num, Created time, Priority (las completa una persona o Notion).
 */
export const DEFAULT_PROPERTY_MAP: Record<string, string> = {
  name: "Name",
  business_days: "Business Days",
  business_hours: "Business Hours",
  rating: "Rating - Google",
  ready: "Ready",
  locality: "Location",
  website: "Webpage",
  phone: "Phone",
  address: "Address",
  contact_info: "Contact Info",
  region: "Area",
  category: "Category",
  email: "Email",
  type: "Type",
  google_maps_url: "URL Google Maps",
};

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Busca la propiedad: nombre exacto, sin distinguir mayúsculas, o que empiece igual ("Rating - Google …"). */
export function resolveProperty(schema: Record<string, PropType>, wanted: string, field?: string): string | null {
  if (schema[wanted]) return wanted;
  const names = Object.keys(schema);
  const w = norm(wanted);
  const found = names.find((n) => norm(n) === w) ?? names.find((n) => norm(n).startsWith(w));
  if (found) return found;
  if (field === "name") return names.find((n) => schema[n] === "title") ?? null;
  return null;
}

export type ProspectFields = Record<string, string | number | boolean | null | undefined>;

type PropType =
  | "title"
  | "rich_text"
  | "url"
  | "phone_number"
  | "email"
  | "number"
  | "select"
  | "status"
  | "multi_select"
  | string;

export function propertyMap(): Record<string, string> {
  const raw = config().NOTION_PROPERTY_MAP;
  if (!raw) return DEFAULT_PROPERTY_MAP;
  return { ...DEFAULT_PROPERTY_MAP, ...(JSON.parse(raw) as Record<string, string>) };
}

const isEmpty = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

const text = (s: string) => [{ type: "text", text: { content: s.slice(0, 2000) } }];

/** Convierte un valor al formato de la propiedad según su tipo. */
export function toNotionValue(type: PropType, value: string | number | boolean | null | undefined): unknown {
  const empty = isEmpty(value) || value === false;
  const str = empty ? EMPTY : String(value);
  switch (type) {
    case "title":
      return { title: text(str) };
    case "rich_text":
      return { rich_text: text(str) };
    case "url":
      return { url: empty ? null : str };
    case "phone_number":
      return { phone_number: empty ? null : str };
    case "email":
      return { email: empty ? null : str };
    case "number": {
      const n = typeof value === "number" ? value : Number(value);
      return { number: empty || Number.isNaN(n) ? null : n };
    }
    case "select":
      return { select: empty ? null : { name: str.slice(0, 100).replace(/,/g, " ") } };
    case "status":
      return empty ? undefined : { status: { name: str } };
    case "multi_select":
      return { multi_select: empty ? [] : [{ name: str.slice(0, 100).replace(/,/g, " ") }] };
    case "checkbox":
      return { checkbox: value === true || value === 1 || value === "true" };
    default:
      return undefined; // tipo no soportado: se omite
  }
}

export function buildProperties(
  fields: ProspectFields,
  schema: Record<string, PropType>,
  map: Record<string, string>,
): { properties: Record<string, unknown>; missing: string[] } {
  const properties: Record<string, unknown> = {};
  const missing: string[] = [];
  for (const [field, wanted] of Object.entries(map)) {
    const propName = resolveProperty(schema, wanted, field);
    if (!propName) {
      missing.push(wanted);
      continue;
    }
    const v = toNotionValue(schema[propName], fields[field]);
    if (v !== undefined) properties[propName] = v;
  }
  return { properties, missing };
}

/** Bloques de párrafo a partir de texto (una línea = un párrafo; líneas vacías = párrafo vacío). */
export function paragraphs(content: string): unknown[] {
  return content.split("\n").map((line) => ({
    object: "block",
    type: "paragraph",
    paragraph: { rich_text: line.trim() ? text(line) : [] },
  }));
}

export class NotionClient {
  private schemaCache: Record<string, PropType> | null = null;
  constructor(
    private token: string,
    private databaseId: string,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  static fromConfig(): NotionClient | null {
    const c = config();
    if (!c.NOTION_TOKEN || !c.NOTION_DATABASE_ID) return null;
    return new NotionClient(c.NOTION_TOKEN, c.NOTION_DATABASE_ID);
  }

  private async call<T>(path: string, method: string, body?: unknown, attempt = 0): Promise<T> {
    const res = await this.fetchImpl(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Notion-Version": VERSION,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429 && attempt < 3) {
      const wait = Number(res.headers.get("retry-after") ?? "1") * 1000;
      await new Promise((r) => setTimeout(r, wait));
      return this.call(path, method, body, attempt + 1);
    }
    if (!res.ok) throw new Error(`Notion ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return (await res.json()) as T;
  }

  async schema(): Promise<Record<string, PropType>> {
    if (!this.schemaCache) {
      const db = await this.call<{ properties: Record<string, { type: string }> }>(
        `/databases/${this.databaseId}`,
        "GET",
      );
      this.schemaCache = Object.fromEntries(Object.entries(db.properties).map(([k, v]) => [k, v.type]));
    }
    return this.schemaCache;
  }

  async upsertProspect(pageId: string | null, fields: ProspectFields) {
    const { properties, missing } = buildProperties(fields, await this.schema(), propertyMap());
    if (pageId) {
      await this.call(`/pages/${pageId}`, "PATCH", { properties });
      return { pageId, missing };
    }
    const page = await this.call<{ id: string }>(`/pages`, "POST", {
      parent: { database_id: this.databaseId },
      properties,
    });
    return { pageId: page.id, missing };
  }

  /** Agrega bloques al cuerpo de la página. Devuelve los ids creados. */
  async appendBlocks(pageId: string, blocks: unknown[]): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 0; i < blocks.length; i += 100) {
      const res = await this.call<{ results: { id: string }[] }>(`/blocks/${pageId}/children`, "PATCH", {
        children: blocks.slice(i, i + 100),
      });
      ids.push(...res.results.map((r) => r.id));
    }
    return ids;
  }

  async deleteBlocks(ids: string[]) {
    for (const id of ids) await this.call(`/blocks/${id}`, "DELETE");
  }
}
