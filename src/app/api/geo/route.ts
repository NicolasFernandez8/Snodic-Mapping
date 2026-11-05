import { q } from "@/lib/db";
import { apiUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** GeoJSON de localidades (polígonos) y prospectos (puntos) para el mapa. */
export async function GET(req: Request) {
  const auth = await apiUser();
  if (auth instanceof Response) return auth;
  const region = new URL(req.url).searchParams.get("region");
  const params = region ? [Number(region)] : [];
  const filter = region ? "WHERE l.region_id = $1" : "";
  const [locs, pros] = await Promise.all([
    q<{ id: number; name: string; status: string; prospects_found: number; boundary: unknown; last_error: string | null }>(
      `SELECT l.id, l.name, l.status, l.prospects_found, l.boundary, l.last_error FROM localities l ${filter}`,
      params,
    ),
    q<{ id: number; name: string; status: string; lat: number; lng: number; locality: string | null; rating: string | null }>(
      `SELECT p.id, p.name, p.status, p.lat, p.lng, l.name AS locality, p.rating FROM prospects p
       LEFT JOIN localities l ON l.id = p.locality_id
       ${filter ? filter + " AND" : "WHERE"} p.lat IS NOT NULL AND p.status <> 'discarded'`,
      params,
    ),
  ]);
  return Response.json({
    localities: {
      type: "FeatureCollection",
      features: locs
        .filter((l) => l.boundary)
        .map((l) => ({
          type: "Feature",
          geometry: l.boundary,
          properties: { id: l.id, name: l.name, status: l.status, prospects: l.prospects_found, error: l.last_error },
        })),
    },
    prospects: pros,
  });
}
