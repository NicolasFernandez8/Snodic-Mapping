/**
 * Exporta localidades y prospectos a KML para importarlos en Google My Maps
 * (Mapa → Agregar capa → Importar). My Maps no ofrece API de escritura.
 */
import type { Area } from "./geometry";

export type KmlLocality = { name: string; status: string; area: Area | null; prospects: number };
export type KmlProspect = {
  name: string;
  locality: string;
  lat: number;
  lng: number;
  description: Record<string, string | number | null | undefined>;
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// KML usa aabbggrr.
const STATUS_STYLE: Record<string, string> = {
  mapped: "7f7f33c2",
  mapping: "7f00a5ff",
  pending: "40ffffff",
  failed: "7f0000ff",
  skipped: "40888888",
};

const ring = (r: [number, number][]) => r.map(([x, y]) => `${x},${y},0`).join(" ");

function polygonKml(area: Area): string {
  const polys = area.type === "Polygon" ? [area.coordinates] : area.coordinates;
  const body = polys
    .map(
      ([outer, ...holes]) =>
        `<Polygon><outerBoundaryIs><LinearRing><coordinates>${ring(outer)}</coordinates></LinearRing></outerBoundaryIs>` +
        holes
          .map((h) => `<innerBoundaryIs><LinearRing><coordinates>${ring(h)}</coordinates></LinearRing></innerBoundaryIs>`)
          .join("") +
        `</Polygon>`,
    )
    .join("");
  return polys.length > 1 ? `<MultiGeometry>${body}</MultiGeometry>` : body;
}

export function toKml(title: string, localities: KmlLocality[], prospects: KmlProspect[]): string {
  const styles = Object.entries(STATUS_STYLE)
    .map(
      ([s, color]) =>
        `<Style id="loc-${s}"><LineStyle><color>ff4a1f4a</color><width>2</width></LineStyle><PolyStyle><color>${color}</color></PolyStyle></Style>`,
    )
    .join("");
  const locs = localities
    .filter((l) => l.area)
    .map(
      (l) =>
        `<Placemark><name>${esc(l.name)}</name><description>${esc(`Estado: ${l.status} · Prospectos: ${l.prospects}`)}</description><styleUrl>#loc-${l.status in STATUS_STYLE ? l.status : "pending"}</styleUrl>${polygonKml(l.area!)}</Placemark>`,
    )
    .join("\n");
  const byLoc = new Map<string, KmlProspect[]>();
  for (const p of prospects) byLoc.set(p.locality, [...(byLoc.get(p.locality) ?? []), p]);
  const pros = [...byLoc.entries()]
    .map(
      ([loc, ps]) =>
        `<Folder><name>${esc(loc)}</name>${ps
          .map((p) => {
            const desc = Object.entries(p.description)
              .map(([k, v]) => `${k}: ${v ?? "-"}`)
              .join("\n");
            return `<Placemark><name>${esc(p.name)}</name><description>${esc(desc)}</description><Point><coordinates>${p.lng},${p.lat},0</coordinates></Point></Placemark>`;
          })
          .join("")}</Folder>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(title)}</name>${styles}
<Folder><name>Localidades</name>
${locs}
</Folder>
<Folder><name>Prospectos</name>
${pros}
</Folder>
</Document></kml>
`;
}
