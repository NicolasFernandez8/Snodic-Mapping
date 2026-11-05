/**
 * Cliente de Overpass API (OpenStreetMap, datos abiertos ODbL).
 * Se usa para la sectorización en localidades y como fuente gratuita de prospectos.
 * Política de uso: consultas moderadas y User-Agent identificable.
 */
import { config } from "../config";
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

export async function overpass(query: string): Promise<OverpassElement[]> {
  const cfg = config();
  const res = await fetch(cfg.OVERPASS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": cfg.APP_USER_AGENT },
    body: "data=" + encodeURIComponent(query),
  });
  if (!res.ok) throw new Error(`Overpass respondió ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { elements: OverpassElement[] };
  return json.elements;
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
