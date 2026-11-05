import { createHash } from "node:crypto";
import { one, q } from "@/lib/db";
import { apiUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** GeoJSON de localidades (polígonos) y prospectos (puntos) para el mapa. */
export async function GET(req: Request) {
  const auth = await apiUser();
  if (auth instanceof Response) return auth;
  const region = new URL(req.url).searchParams.get("region");
  const params = region ? [Number(region)] : [];
  const filter = region ? "WHERE l.region_id = $1" : "";
  // Versión de los datos: si el navegador ya la tiene, responde 304 sin mandar nada.
  const ver = await one<{ v: string }>(
    `SELECT concat_ws('|', (SELECT count(*) FROM localities), (SELECT max(mapped_at) FROM localities),
       (SELECT string_agg(status || count, ',') FROM (SELECT status, count(*) FROM localities GROUP BY status) s),
       (SELECT count(*) FROM prospects), (SELECT max(updated_at) FROM prospects), $1::text) AS v`,
    [region ?? ""],
  );
  const etag = `"${createHash("sha1").update(ver!.v).digest("hex").slice(0, 16)}"`;
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { ETag: etag } });
  const [locs, pros] = await Promise.all([
    q<{ id: number; name: string; status: string; prospects_found: number; boundary: unknown; last_error: string | null }>(
      `SELECT l.id, l.name, l.status, l.prospects_found, COALESCE(l.boundary_simple, l.boundary) AS boundary, l.last_error FROM localities l ${filter}`,
      params,
    ),
    q<{ id: number; name: string; status: string; lat: number; lng: number; locality: string | null; rating: string | null }>(
      `SELECT p.id, p.name, p.status, p.lat, p.lng, l.name AS locality, p.rating FROM prospects p
       LEFT JOIN localities l ON l.id = p.locality_id
       ${filter ? filter + " AND" : "WHERE"} p.lat IS NOT NULL AND p.status <> 'discarded' AND p.duplicate_of IS NULL`,
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
  }, { headers: { ETag: etag, "Cache-Control": "private, no-cache" } });
}
