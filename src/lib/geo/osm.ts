/**
 * Cliente de Overpass API (OpenStreetMap, datos abiertos ODbL).
 * Se usa para la sectorización en localidades y como fuente gratuita de prospectos.
 * Política de uso: consultas moderadas y User-Agent identificable.
 */
import { createHash } from "node:crypto";
import { config } from "../config";
import { one, q } from "../db";
import { buildArea, type Area, type Position } from "./geometry";
import { stitchRings } from "./geometry";

export type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
  members?: { type: string; ref: number; role: string; geometry?: { lat: number; lon: number }[] }[];
};

/** Servidores públicos de Overpass (gratis). Se prueba el configurado y después los alternativos. */
export const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const CACHE_DAYS = 7;

/**
 * Consulta Overpass con caché en PostgreSQL (7 días), reintentos con espera creciente
 * ante 429/5xx y servidores alternativos. `fetchImpl` y `sleep` se pueden reemplazar en tests.
 */
export async function overpass(
  query: string,
  opts: { fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void>; cache?: boolean } = {},
): Promise<OverpassElement[]> {
  const cfg = config();
  const fetchImpl = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const useCache = opts.cache ?? true;
  const hash = createHash("sha256").update(query).digest("hex");
  if (useCache) {
    const hit = await one<{ response: OverpassElement[] }>(
      `SELECT response FROM overpass_cache WHERE query_hash = $1 AND fetched_at > now() - ($2 || ' days')::interval`,
      [hash, String(CACHE_DAYS)],
    );
    if (hit) return hit.response;
  }
  const urls = [cfg.OVERPASS_URL, ...OVERPASS_MIRRORS.filter((u) => u !== cfg.OVERPASS_URL)];
  let lastError = "";
  for (const url of urls) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetchImpl(url, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": cfg.APP_USER_AGENT },
          body: "data=" + encodeURIComponent(query),
        });
        if (res.ok) {
          const json = (await res.json()) as { elements: OverpassElement[] };
          if (useCache)
            await q(
              `INSERT INTO overpass_cache (query_hash, response, fetched_at) VALUES ($1,$2::jsonb, now())
               ON CONFLICT (query_hash) DO UPDATE SET response = EXCLUDED.response, fetched_at = now()`,
              [hash, JSON.stringify(json.elements)],
            );
          return json.elements;
        }
        lastError = `${url} respondió ${res.status}: ${(await res.text()).slice(0, 160)}`;
        if (res.status !== 429 && res.status < 500) break; // error de consulta: no tiene sentido reintentar
      } catch (e) {
        lastError = `${url}: ${(e as Error).message}`;
      }
      await sleep(2000 * 2 ** attempt);
    }
  }
  throw new Error(`Overpass no respondió (${lastError})`);
}

export type OsmBoundary = {
  osmId: string;
  name: string;
  adminLevel: number | null;
  area: Area;
  tags: Record<string, string>;
};

/** Convierte una relación con "out geom" en un área GeoJSON. */
export function relationToBoundary(el: OverpassElement): OsmBoundary | null {
  if (el.type !== "relation" || !el.members) return null;
  const seg = (role: string[]) =>
    el.members!
      .filter((m) => m.type === "way" && m.geometry && role.includes(m.role))
      .map((m) => m.geometry!.map((g) => [g.lon, g.lat] as Position));
  const area = buildArea(stitchRings(seg(["outer", ""])), stitchRings(seg(["inner"])));
  if (!area) return null;
  const tags = el.tags ?? {};
  return {
    osmId: `relation/${el.id}`,
    name: tags["name:es"] || tags.name || `relation ${el.id}`,
    adminLevel: tags.admin_level ? Number(tags.admin_level) : null,
    area,
    tags,
  };
}

export const queries = {
  /** Busca la relación administrativa de una región por nombre. */
  findRegion: (name: string, adminLevel: number) =>
    `[out:json][timeout:60];
rel["boundary"="administrative"]["admin_level"="${adminLevel}"]["name"~"${escapeRegex(name)}",i];
out tags;`,

  /** Subdivisiones administrativas dentro de una relación (p. ej. municipios de una provincia). */
  subdivisions: (relationId: number, adminLevel: number) =>
    `[out:json][timeout:300];
rel(${relationId});map_to_area->.a;
rel(area.a)["boundary"="administrative"]["admin_level"="${adminLevel}"];
out geom;`,

  /** POIs del rubro dentro de una localidad. */
  pois: (relationId: number, tags: { k: string; v: string }[]) =>
    `[out:json][timeout:180];
rel(${relationId});map_to_area->.a;
(
${tags.map((t) => `  nwr(area.a)["${t.k}"="${t.v}"];`).join("\n")}
);
out center tags;`,
};

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\"]/g, "\\$&");
}

export function relationIdOf(osmId: string): number {
  const m = /^relation\/(\d+)$/.exec(osmId);
  if (!m) throw new Error(`osm_id inválido: ${osmId}`);
  return Number(m[1]);
}
