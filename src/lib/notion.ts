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
  social: "Social Networks",
};

/**
 * Campos que solo se completan al CREAR la página: después los maneja una persona en Notion
 * (no se pisan en cada sincronización).
 */
export const CREATE_ONLY = new Set(["region", "category", "social", "type"]);

/** Si el valor no coincide con ninguna opción existente de la columna, se usa esta (en vez de crear opciones nuevas). */
const OPTION_FALLBACK: Record<string, string> = { region: "Random" };
/** Para estas columnas solo se usan opciones que ya existen (nunca se crean). */
const ONLY_EXISTING = new Set(["social", "type"]);

const fold = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Opción existente que corresponde al valor (sin importar mayúsculas, acentos, emojis ni corchetes). */
export function matchOption(options: string[], value: string): string | null {
  const v = fold(value);
  if (!v) return null;
  return (
    options.find((o) => fold(o) === v) ??
    options.find((o) => fold(o).split(" ").includes(v) || fold(o).endsWith(v)) ??
    // "San Blas - Santo Domingo" (OpenStreetMap) → opción existente "San Blas"
    options.find((o) => fold(o).length >= 4 && v.startsWith(`${fold(o)} `)) ??
    null
  );
}

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

export type ProspectFields = Record<string, string | number | boolean | string[] | null | undefined>;

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
  options: Record<string, string[]> = {},
  creating = true,
): { properties: Record<string, unknown>; missing: string[] } {
  const properties: Record<string, unknown> = {};
  const missing: string[] = [];
  for (const [field, wanted] of Object.entries(map)) {
    if (!creating && CREATE_ONLY.has(field)) continue;
    const propName = resolveProperty(schema, wanted, field);
    if (!propName) {
      missing.push(wanted);
      continue;
    }
    const type = schema[propName];
    let value = fields[field];
    // Selecciones: usar las opciones que ya tiene la columna.
    if ((type === "select" || type === "multi_select" || type === "status") && options[propName]?.length) {
      const opts = options[propName];
      const wantedValues = Array.isArray(value) ? value : value === null || value === undefined || value === "" ? [] : [String(value)];
      const picked = wantedValues
        .map((x) => matchOption(opts, String(x)) ?? (ONLY_EXISTING.has(field) ? null : String(x)))
        .filter((x): x is string => !!x);
      if (!picked.length && OPTION_FALLBACK[field]) {
        const fb = matchOption(opts, OPTION_FALLBACK[field]);
        if (fb) picked.push(fb);
      }
      if (type === "multi_select") {
        if (!picked.length && ONLY_EXISTING.has(field)) continue;
        properties[propName] = { multi_select: [...new Set(picked)].map((name) => ({ name: name.slice(0, 100).replace(/,/g, " ") })) };
        continue;
      }
      value = picked[0] ?? null;
      if (value === null && ONLY_EXISTING.has(field)) continue;
    } else if (Array.isArray(value)) {
      value = value.join(", ");
    }
    const v = toNotionValue(type, value as string | number | boolean | null | undefined);
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

export type NotionPage = { id: string; properties: Record<string, Record<string, unknown> & { type: string }> };

/** Valor de texto de una propiedad de Notion (título, texto, url, teléfono, email, número, select, estado). "-" cuenta como vacío. */
export function propText(prop: (Record<string, unknown> & { type: string }) | undefined): string | null {
  if (!prop) return null;
  const v = prop[prop.type];
  let s: string | null = null;
  if (Array.isArray(v)) s = v.map((x: { plain_text?: string; name?: string }) => x.plain_text ?? x.name ?? "").join(prop.type === "multi_select" ? ", " : "");
  else if (v && typeof v === "object" && "name" in (v as object)) s = String((v as { name: string }).name);
  else if (typeof v === "string" || typeof v === "number") s = String(v);
  s = s?.trim() ?? null;
  return s && s !== EMPTY ? s : null;
}

/**
 * ID de la base a partir de lo que se pegue en NOTION_DATABASE_ID: el ID solo o el link copiado de Notion
 * (https://www.notion.so/<espacio>/Snodic-Mapping-<id>?v=<vista>). La vista (?v=) se ignora.
 */
export function notionId(raw: string): string {
  const path = raw.trim().split("?")[0];
  const hex = path.replace(/-/g, "").match(/[0-9a-f]{32}/gi);
  return hex ? hex[hex.length - 1].toLowerCase() : raw.trim();
}

export class NotionClient {
  private schemaCache: Record<string, PropType> | null = null;
  private nextNum: number | null = null;
  private optionsCache: Record<string, string[]> = {};
  private databaseId: string;
  constructor(
    private token: string,
    databaseId: string,
    private fetchImpl: typeof fetch = fetch,
    /** Columna numérica correlativa ("Num"): las páginas nuevas siguen desde el número más alto de la base. */
    private numProperty = "Num",
  ) {
    this.databaseId = notionId(databaseId);
  }

  static fromConfig(): NotionClient | null {
    const c = config();
    if (!c.NOTION_TOKEN || !c.NOTION_DATABASE_ID) return null;
    return new NotionClient(c.NOTION_TOKEN, c.NOTION_DATABASE_ID, fetch, c.NOTION_NUM_PROPERTY || "Num");
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
      const db = await this.call<{ properties: Record<string, { type: string } & Record<string, { options?: { name: string }[] }>> }>(
        `/databases/${this.databaseId}`,
        "GET",
      );
      this.schemaCache = Object.fromEntries(Object.entries(db.properties).map(([k, v]) => [k, v.type]));
      this.optionsCache = Object.fromEntries(
        Object.entries(db.properties).map(([k, v]) => [k, (v[v.type]?.options ?? []).map((o) => o.name)]),
      );
    }
    return this.schemaCache;
  }

  /** Opciones de las columnas de selección (select, multi_select, status). */
  async options(): Promise<Record<string, string[]>> {
    await this.schema();
    return this.optionsCache;
  }

  /**
   * Próximo número correlativo para una página nueva (máximo actual de la columna + 1).
   * Solo si la columna existe y es de tipo número; si no, null y no se escribe nada.
   * Se lee una vez por sincronización y después se incrementa en memoria.
   */
  async takeNumber(): Promise<{ prop: string; value: number } | null> {
    const schema = await this.schema();
    const prop = resolveProperty(schema, this.numProperty);
    if (!prop || schema[prop] !== "number") return null;
    if (this.nextNum === null) {
      const res = await this.call<{ results: NotionPage[] }>(`/databases/${this.databaseId}/query`, "POST", {
        page_size: 1,
        sorts: [{ property: prop, direction: "descending" }],
        filter: { property: prop, number: { is_not_empty: true } },
      });
      const max = Number((res.results[0]?.properties?.[prop] as { number?: number } | undefined)?.number ?? 0);
      this.nextNum = (Number.isFinite(max) ? max : 0) + 1;
    }
    return { prop, value: this.nextNum++ };
  }

  async upsertProspect(pageId: string | null, fields: ProspectFields) {
    const schema = await this.schema();
    const { properties, missing } = buildProperties(fields, schema, propertyMap(), this.optionsCache, !pageId);
    if (!pageId) {
      // Las páginas nuevas reciben el siguiente número de "Num" (las existentes no se tocan)…
      const num = await this.takeNumber();
      if (num) properties[num.prop] = { number: num.value };
      // …y arrancan en el primer estado de contacto ("Pending Contact"), si existe.
      const state = resolveProperty(schema, "State");
      const pending = state && schema[state] === "status" ? matchOption(this.optionsCache[state] ?? [], "Pending Contact") : null;
      if (state && pending) properties[state] = { status: { name: pending } };
    }
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

  /** Lee las páginas de la base (paginado, solo lectura). */
  async queryPages(max = 1000): Promise<NotionPage[]> {
    const out: NotionPage[] = [];
    let cursor: string | undefined;
    do {
      const res = await this.call<{ results: NotionPage[]; has_more: boolean; next_cursor: string | null }>(
        `/databases/${this.databaseId}/query`,
        "POST",
        { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) },
      );
      out.push(...res.results);
      cursor = res.has_more && res.next_cursor ? res.next_cursor : undefined;
    } while (cursor && out.length < max);
    return out;
  }

  /** Páginas sin número en la columna correlativa, de la más vieja a la más nueva. */
  async pagesWithoutNumber(prop: string, max = 1000): Promise<NotionPage[]> {
    const out: NotionPage[] = [];
    let cursor: string | undefined;
    do {
      const res = await this.call<{ results: NotionPage[]; has_more: boolean; next_cursor: string | null }>(
        `/databases/${this.databaseId}/query`,
        "POST",
        {
          page_size: 100,
          filter: { property: prop, number: { is_empty: true } },
          sorts: [{ timestamp: "created_time", direction: "ascending" }],
          ...(cursor ? { start_cursor: cursor } : {}),
        },
      );
      out.push(...res.results);
      cursor = res.has_more && res.next_cursor ? res.next_cursor : undefined;
    } while (cursor && out.length < max);
    return out;
  }

  async updatePage(pageId: string, properties: Record<string, unknown>) {
    await this.call(`/pages/${pageId}`, "PATCH", { properties });
  }

  /** Nombre real de la columna correlativa si existe y es numérica. */
  async numberProperty(): Promise<string | null> {
    const schema = await this.schema();
    const prop = resolveProperty(schema, this.numProperty);
    return prop && schema[prop] === "number" ? prop : null;
  }

  async deleteBlocks(ids: string[]) {
    for (const id of ids) await this.call(`/blocks/${id}`, "DELETE");
  }
}
