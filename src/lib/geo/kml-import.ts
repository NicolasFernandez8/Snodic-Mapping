/**
 * Importa polígonos desde KML (por ejemplo, sectores dibujados a mano en Google My Maps
 * y exportados con "Exportar a KML/KMZ" → KML). Solo se leen Placemarks con Polygon.
 */
import { buildArea, type Area, type Position, type Ring } from "./geometry";

export type KmlSector = { name: string; area: Area };

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .trim();

function parseCoords(s: string): Ring {
  return s
    .trim()
    .split(/\s+/)
    .map((t) => t.split(",").map(Number))
    .filter((p) => p.length >= 2 && p.every((n) => !Number.isNaN(n)))
    .map((p) => [p[0], p[1]] as Position);
}

export function parseKmlSectors(kml: string): KmlSector[] {
  const out: KmlSector[] = [];
  const placemarks = kml.match(/<Placemark[\s\S]*?<\/Placemark>/g) ?? [];
  for (const pm of placemarks) {
    const name = decode(/<name>([\s\S]*?)<\/name>/.exec(pm)?.[1] ?? "Sector sin nombre");
    const outers: Ring[] = [];
    const inners: Ring[] = [];
    for (const poly of pm.match(/<Polygon[\s\S]*?<\/Polygon>/g) ?? []) {
      const ob = /<outerBoundaryIs>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/.exec(poly);
      if (ob) outers.push(parseCoords(ob[1]));
      for (const ib of poly.match(/<innerBoundaryIs>[\s\S]*?<\/innerBoundaryIs>/g) ?? []) {
        const c = /<coordinates>([\s\S]*?)<\/coordinates>/.exec(ib);
        if (c) inners.push(parseCoords(c[1]));
      }
    }
    const valid = outers.filter((r) => r.length >= 4);
    const area = buildArea(valid, inners);
    if (area) out.push({ name, area });
  }
  return out;
}
