/**
 * Filtros combinables para buscar los prospectos con más chances.
 * Se representan como query string (?cat=hotel&pain=reservas&has=phone…) para poder compartir links
 * y guardarse como "búsquedas guardadas".
 */
import { one, q } from "./db";

export type Filters = {
  q?: string;
  region?: number;
  locality?: number;
  maxKm?: number;
  cat?: string[];
  minStars?: number;
  maxStars?: number;
  chain?: "independent" | "chain";
  has?: ("phone" | "website" | "email" | "social")[];
  pain?: string[];
  minRating?: number;
  maxRating?: number;
  minReviews?: number;
  minScore?: number;
  stage?: string;
  status?: string;
  notContacted?: boolean;
  withMessage?: boolean;
  owner?: "me" | "none" | number;
};

const num = (v: string | null) => (v !== null && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : undefined);
const list = (sp: URLSearchParams, k: string) =>
  sp
    .getAll(k)
    .flatMap((v) => v.split(","))
    .map((v) => v.trim())
    .filter(Boolean);

export const FILTER_KEYS = [
  "q", "region", "locality", "maxKm", "cat", "minStars", "maxStars", "chain", "has", "pain", "minRating",
  "maxRating", "minReviews", "minScore", "stage", "status", "notContacted", "withMessage", "owner",
] as const;

export function parseFilters(input: URLSearchParams | Record<string, string | string[] | undefined>): Filters {
  const sp =
    input instanceof URLSearchParams
      ? input
      : new URLSearchParams(
          Object.entries(input).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : v === undefined ? [] : [[k, v]])),
        );
  const f: Filters = {};
  if (sp.get("q")?.trim()) f.q = sp.get("q")!.trim().slice(0, 100);
  f.region = num(sp.get("region"));
  f.locality = num(sp.get("locality"));
  f.maxKm = num(sp.get("maxKm"));
  const cat = list(sp, "cat");
  if (cat.length) f.cat = cat;
  f.minStars = num(sp.get("minStars"));
  f.maxStars = num(sp.get("maxStars"));
  const chain = sp.get("chain");
  if (chain === "independent" || chain === "chain") f.chain = chain;
  const has = list(sp, "has").filter((h): h is "phone" | "website" | "email" | "social" =>
    ["phone", "website", "email", "social"].includes(h),
  );
  if (has.length) f.has = has;
  const pain = list(sp, "pain");
  if (pain.length) f.pain = pain;
  f.minRating = num(sp.get("minRating"));
  f.maxRating = num(sp.get("maxRating"));
  f.minReviews = num(sp.get("minReviews"));
  f.minScore = num(sp.get("minScore"));
  if (sp.get("stage")) f.stage = sp.get("stage")!;
  if (sp.get("status")) f.status = sp.get("status")!;
  if (sp.get("notContacted") === "1") f.notContacted = true;
  if (sp.get("withMessage") === "1") f.withMessage = true;
  const owner = sp.get("owner");
  if (owner === "me" || owner === "none") f.owner = owner;
  else if (num(owner) !== undefined) f.owner = num(owner);
  for (const k of Object.keys(f) as (keyof Filters)[]) if (f[k] === undefined) delete f[k];
  return f;
}

export function filtersToQuery(f: Filters): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined || v === false) continue;
    if (Array.isArray(v)) v.forEach((x) => sp.append(k, String(x)));
    else sp.set(k, v === true ? "1" : String(v));
  }
  return sp.toString();
}

export const isEmpty = (f: Filters) => Object.keys(f).length === 0;

/**
 * Condiciones SQL (alias: p = prospects, l = localities). Agrega los valores a `params` y devuelve
 * una lista de condiciones para unir con AND.
 */
export function filterSql(f: Filters, params: unknown[], meId?: number): string[] {
  const w: string[] = [];
  const add = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  if (f.q) {
    const ph = add(`%${f.q}%`);
    w.push(`(p.name ILIKE ${ph} OR p.address ILIKE ${ph})`);
  }
  if (f.region !== undefined) w.push(`l.region_id = ${add(f.region)}`);
  if (f.locality !== undefined) w.push(`p.locality_id = ${add(f.locality)}`);
  if (f.maxKm !== undefined) w.push(`l.distance_km <= ${add(f.maxKm)}`);
  if (f.cat?.length) w.push(`p.category = ANY(${add(f.cat)}::text[])`);
  if (f.minStars !== undefined) w.push(`p.stars >= ${add(f.minStars)}`);
  if (f.maxStars !== undefined) w.push(`p.stars <= ${add(f.maxStars)}`);
  if (f.chain === "independent") w.push(`p.brand IS NULL`);
  if (f.chain === "chain") w.push(`p.brand IS NOT NULL`);
  for (const h of f.has ?? []) {
    if (h === "phone") w.push(`p.phone IS NOT NULL`);
    if (h === "website") w.push(`p.website IS NOT NULL`);
    if (h === "email") w.push(`p.email IS NOT NULL`);
    if (h === "social") w.push(`(p.instagram IS NOT NULL OR p.facebook IS NOT NULL)`);
  }
  if (f.pain?.length) w.push(`p.pain_tags && ${add(f.pain)}::text[]`);
  if (f.minRating !== undefined) w.push(`p.rating >= ${add(f.minRating)}`);
  if (f.maxRating !== undefined) w.push(`p.rating <= ${add(f.maxRating)}`);
  if (f.minReviews !== undefined) w.push(`COALESCE(p.reviews_count, 0) >= ${add(f.minReviews)}`);
  if (f.minScore !== undefined) w.push(`COALESCE(p.score, 0) >= ${add(f.minScore)}`);
  if (f.stage) w.push(`p.stage = ${add(f.stage)}`);
  if (f.status) w.push(`p.status = ${add(f.status)}`);
  if (f.notContacted) w.push(`p.contacted_at IS NULL AND p.stage = 'to_contact'`);
  if (f.withMessage)
    w.push(`EXISTS (SELECT 1 FROM outputs o WHERE o.prospect_id = p.id AND o.kind = 'message' AND o.content IS NOT NULL)`);
  if (f.owner === "me" && meId) w.push(`p.assigned_to = ${add(meId)}`);
  else if (f.owner === "none") w.push(`p.assigned_to IS NULL`);
  else if (typeof f.owner === "number") w.push(`p.assigned_to = ${add(f.owner)}`);
  return w;
}

// --- Búsquedas guardadas ---
export type SavedSearch = { id: number; name: string; filters: Filters; created_by: number | null; owner: string | null };

export async function listSearches(): Promise<SavedSearch[]> {
  return q<SavedSearch>(
    `SELECT s.id, s.name, s.filters, s.created_by, u.username AS owner FROM saved_searches s
     LEFT JOIN users u ON u.id = s.created_by ORDER BY s.name`,
  );
}

export async function saveSearch(name: string, filters: Filters, userId: number) {
  const clean = parseFilters(new URLSearchParams(filtersToQuery(filters)));
  return one<{ id: number }>("INSERT INTO saved_searches (name, filters, created_by) VALUES ($1,$2::jsonb,$3) RETURNING id", [
    name.trim().slice(0, 80),
    JSON.stringify(clean),
    userId,
  ]);
}

export async function deleteSearch(id: number) {
  await q("DELETE FROM saved_searches WHERE id = $1", [id]);
}

/** Valores disponibles para los selectores (categorías, regiones, localidades, problemas). */
export async function filterOptions() {
  const [cats, regions, localities, pains, users] = await Promise.all([
    q<{ v: string; n: number }>(
      "SELECT category AS v, count(*)::int AS n FROM prospects WHERE category IS NOT NULL GROUP BY category ORDER BY n DESC LIMIT 30",
    ),
    q<{ id: number; name: string }>("SELECT id, name FROM regions ORDER BY position"),
    q<{ id: number; name: string }>("SELECT id, name FROM localities WHERE prospects_found > 0 ORDER BY name"),
    q<{ v: string; n: number }>(
      "SELECT t AS v, count(*)::int AS n FROM prospects, unnest(pain_tags) t GROUP BY t ORDER BY n DESC",
    ),
    q<{ id: number; username: string }>("SELECT id, username FROM users ORDER BY username"),
  ]);
  return { cats, regions, localities, pains, users };
}
