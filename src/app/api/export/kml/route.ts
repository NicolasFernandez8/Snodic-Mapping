import { q } from "@/lib/db";
import { toKml } from "@/lib/geo/kml";
import type { Area } from "@/lib/geo/geometry";

export const dynamic = "force-dynamic";

/**
 * KML para importar en Google My Maps (Agregar capa → Importar).
 * ?only=mapped exporta solo localidades ya mapeadas.
 */
export async function GET(req: Request) {
  const only = new URL(req.url).searchParams.get("only");
  const locs = await q<{ name: string; status: string; boundary: Area | null; prospects_found: number }>(
    `SELECT name, status, boundary, prospects_found FROM localities ${only === "mapped" ? "WHERE status = 'mapped'" : ""} ORDER BY distance_km`,
  );
  const pros = await q<{
    name: string;
    locality: string | null;
    lat: number;
    lng: number;
    phone: string | null;
    website: string | null;
    rating: string | null;
    google_maps_url: string | null;
    status: string;
  }>(
    `SELECT p.name, l.name AS locality, p.lat, p.lng, p.phone, p.website, p.rating, p.google_maps_url, p.status
     FROM prospects p LEFT JOIN localities l ON l.id = p.locality_id
     WHERE p.lat IS NOT NULL AND p.status <> 'discarded' ${only === "mapped" ? "AND l.status = 'mapped'" : ""}`,
  );
  const kml = toKml(
    "Snodic · Prospectos",
    locs.map((l) => ({ name: l.name, status: l.status, area: l.boundary, prospects: l.prospects_found })),
    pros.map((p) => ({
      name: p.name,
      locality: p.locality ?? "Sin localidad",
      lat: p.lat,
      lng: p.lng,
      description: { Teléfono: p.phone, Web: p.website, Rating: p.rating, "Google Maps": p.google_maps_url, Estado: p.status },
    })),
  );
  const date = new Date().toISOString().slice(0, 10);
  return new Response(kml, {
    headers: {
      "Content-Type": "application/vnd.google-earth.kml+xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="snodic-mapping-${date}.kml"`,
    },
  });
}
