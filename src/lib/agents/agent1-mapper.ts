/**
 * AGENTE 1 — Mapeo automático.
 * 1) Sectoriza una región (p. ej. provincia de Alicante) en localidades usando límites
 *    administrativos de OpenStreetMap, o sectores propios importados desde KML.
 * 2) Cada día recorre las próximas N localidades pendientes (de la más cercana al origen
 *    hacia afuera) y descubre los prospectos del rubro activo dentro de cada polígono.
 * 3) Al terminar una región pasa automáticamente a la siguiente en cola.
 */
import { config } from "../config";
import { getSetting, one, q } from "../db";
import { bbox, centroid, haversineKm, pointInArea, type Area, type Position } from "../geo/geometry";
import { overpass, queries, relationIdOf, relationToBoundary } from "../geo/osm";
import type { KmlSector } from "../geo/kml-import";
import { matchesNiche, PlacesClient, type PlaceSummary } from "../sources/places";
import type { AgentLog, LocalityRow, Niche } from "./types";

/** Centro del mapa de Snodic en Alicante (My Maps de referencia). */
export const ALICANTE_ORIGIN: Position = [-0.5039090020158565, 38.35604185309951];

export async function activeNiche(): Promise<Niche> {
  const key = await getSetting<string>("active_niche", "hospitality");
  const n = await one<Niche>("SELECT * FROM niches WHERE key = $1", [key]);
  if (!n) throw new Error(`No existe el rubro "${key}"`);
  return n;
}

type SaveLocality = { name: string; osmId: string | null; adminLevel: number | null; area: Area; parentId?: number | null };

async function saveLocalities(regionId: number, origin: Position, items: SaveLocality[]) {
  let saved = 0;
  for (const it of items) {
    const c = centroid(it.area);
    await q(
      `INSERT INTO localities (region_id, parent_id, name, osm_id, admin_level, boundary, bbox, centroid_lat, centroid_lng, distance_km)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10)
       ON CONFLICT (region_id, osm_id) DO UPDATE SET
         name = EXCLUDED.name, boundary = EXCLUDED.boundary, bbox = EXCLUDED.bbox,
         centroid_lat = EXCLUDED.centroid_lat, centroid_lng = EXCLUDED.centroid_lng, distance_km = EXCLUDED.distance_km`,
      [
        regionId,
        it.parentId ?? null,
        it.name,
        it.osmId,
        it.adminLevel,
        JSON.stringify(it.area),
        bbox(it.area),
        c[1],
        c[0],
        haversineKm(origin, c),
      ],
    );
    saved++;
  }
  return saved;
}

/**
 * Importa una región desde OSM y la sectoriza.
 * Ej.: { name: "Alicante", adminLevel: 6, localityLevel: 8 } → los municipios de la provincia.
 * Para dividir una ciudad en barrios: { name: "Alicante", adminLevel: 8, localityLevel: 10 }.
 */
export async function importRegion(
  opts: { name: string; adminLevel?: number; localityLevel?: number; relationId?: number; origin?: Position },
  log: AgentLog = () => {},
) {
  const adminLevel = opts.adminLevel ?? 6;
  const localityLevel = opts.localityLevel ?? 8;
  let relationId = opts.relationId;
  let regionName = opts.name;
  if (!relationId) {
    const found = await overpass(queries.findRegion(opts.name, adminLevel));
    const rel = found.find((e) => e.type === "relation");
    if (!rel) throw new Error(`No encontré "${opts.name}" con admin_level=${adminLevel} en OpenStreetMap`);
    relationId = rel.id;
    regionName = rel.tags?.["name:es"] || rel.tags?.name || opts.name;
    log(`Región encontrada: ${regionName} (relation/${relationId})`);
  }
  const origin = opts.origin ?? ALICANTE_ORIGIN;
  const position = (await one<{ n: number }>("SELECT COALESCE(MAX(position),0)+1 AS n FROM regions"))!.n;
  const hasActive = await one("SELECT 1 FROM regions WHERE status = 'active'");
  const region = (await one<{ id: number }>(
    `INSERT INTO regions (name, osm_relation_id, admin_level, origin_lat, origin_lng, status, position)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (osm_relation_id) DO UPDATE SET name = EXCLUDED.name, admin_level = EXCLUDED.admin_level
     RETURNING id`,
    [regionName, relationId, localityLevel, origin[1], origin[0], hasActive ? "queued" : "active", position],
  ))!;
  const els = await overpass(queries.subdivisions(relationId, localityLevel));
  const items: SaveLocality[] = [];
  for (const el of els) {
    const b = relationToBoundary(el);
    if (b) items.push({ name: b.name, osmId: b.osmId, adminLevel: b.adminLevel, area: b.area });
  }
  const saved = await saveLocalities(region.id, origin, items);
  log(`${saved} localidades guardadas para ${regionName}`);
  return { regionId: region.id, localities: saved };
}

/** Importa sectores propios (KML de My Maps) como localidades de una región nueva o existente. */
export async function importSectors(regionName: string, sectors: KmlSector[], origin: Position = ALICANTE_ORIGIN) {
  let region = await one<{ id: number }>("SELECT id FROM regions WHERE name = $1 AND osm_relation_id IS NULL", [
    regionName,
  ]);
  if (!region) {
    const hasActive = await one("SELECT 1 FROM regions WHERE status = 'active'");
    region = await one<{ id: number }>(
      `INSERT INTO regions (name, origin_lat, origin_lng, status, position)
       VALUES ($1,$2,$3,$4,(SELECT COALESCE(MAX(position),0)+1 FROM regions)) RETURNING id`,
      [regionName, origin[1], origin[0], hasActive ? "queued" : "active"],
    );
  }
  const saved = await saveLocalities(
    region!.id,
    origin,
    sectors.map((s) => ({ name: s.name, osmId: `kml/${slug(s.name)}`, adminLevel: null, area: s.area })),
  );
  return { regionId: region!.id, localities: saved };
}

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export type DiscoveredPlace = {
  source: "google_places" | "osm";
  sourceId: string;
  name: string;
  category?: string;
  address?: string;
  lat: number;
  lng: number;
  rating?: number;
  reviewsCount?: number;
  googleMapsUrl?: string;
  phone?: string;
  website?: string;
  email?: string;
  instagram?: string;
  businessStatus?: string;
  raw: unknown;
};

export interface ProspectSource {
  discover(loc: LocalityRow, niche: Niche): Promise<DiscoveredPlace[]>;
}

export class GooglePlacesSource implements ProspectSource {
  constructor(private client: PlacesClient) {}
  async discover(loc: LocalityRow, niche: Niche) {
    if (!loc.bbox) return [];
    const found = new Map<string, PlaceSummary>();
    for (const kw of niche.keywords.length ? niche.keywords : [niche.label]) {
      for (const p of await this.client.searchArea(`${kw} en ${loc.name}`, loc.bbox)) found.set(p.id, p);
    }
    return [...found.values()]
      .filter((p) => matchesNiche(p, niche.google_types))
      .filter((p) => p.businessStatus !== "CLOSED_PERMANENTLY")
      .filter((p) => p.lat !== undefined && p.lng !== undefined)
      .map(
        (p): DiscoveredPlace => ({
          source: "google_places",
          sourceId: p.id,
          name: p.name,
          category: p.primaryType ?? p.types[0],
          address: p.address,
          lat: p.lat!,
          lng: p.lng!,
          rating: p.rating,
          reviewsCount: p.reviewsCount,
          googleMapsUrl: p.googleMapsUrl,
          businessStatus: p.businessStatus,
          raw: p,
        }),
      );
  }
}

export class OsmSource implements ProspectSource {
  async discover(loc: LocalityRow, niche: Niche) {
    if (!loc.osm_id?.startsWith("relation/") || !niche.osm_tags.length) return [];
    const els = await overpass(queries.pois(relationIdOf(loc.osm_id), niche.osm_tags));
    return els
      .map((e): DiscoveredPlace | null => {
        const lat = e.lat ?? e.center?.lat;
        const lng = e.lon ?? e.center?.lon;
        const t = e.tags ?? {};
        if (lat === undefined || lng === undefined || !t.name) return null;
        const addr = [t["addr:street"], t["addr:housenumber"], t["addr:postcode"], t["addr:city"]]
          .filter(Boolean)
          .join(" ");
        const tag = niche.osm_tags.find((x) => t[x.k] === x.v);
        return {
          source: "osm",
          sourceId: `${e.type}/${e.id}`,
          name: t.name,
          category: tag ? tag.v : undefined,
          address: addr || undefined,
          lat,
          lng,
          phone: t.phone ?? t["contact:phone"],
          website: t.website ?? t["contact:website"],
          email: t.email ?? t["contact:email"],
          instagram: t["contact:instagram"] ?? t.instagram,
          googleMapsUrl: mapsSearchUrl(t.name, addr || loc.name),
          raw: e,
        };
      })
      .filter((x): x is DiscoveredPlace => x !== null);
  }
}

export async function sourceFromSettings(): Promise<ProspectSource> {
  // Por defecto OSM (gratis, sin clave). Google Places solo si se eligió Y hay clave configurada.
  const kind = await getSetting<string>("prospect_source", "osm");
  if (kind === "google_places" && config().GOOGLE_MAPS_API_KEY) return new GooglePlacesSource(PlacesClient.fromConfig());
  return new OsmSource();
}

/** Guarda prospectos descubiertos (deduplicados por fuente+id) y devuelve cuántos son nuevos. */
export async function saveDiscovered(loc: LocalityRow, niche: Niche, places: DiscoveredPlace[]) {
  let created = 0;
  for (const p of places) {
    if (loc.boundary && !pointInArea([p.lng, p.lat], loc.boundary)) continue;
    const row = await one<{ inserted: boolean }>(
      `INSERT INTO prospects (locality_id, niche_key, source, source_id, name, category, address, phone, website, email,
                              google_maps_url, rating, reviews_count, business_status, lat, lng, raw, instagram)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18)
       ON CONFLICT (source, source_id) DO UPDATE SET
         rating = EXCLUDED.rating, reviews_count = EXCLUDED.reviews_count, updated_at = now()
       RETURNING (xmax = 0) AS inserted`,
      [
        loc.id,
        niche.key,
        p.source,
        p.sourceId,
        p.name,
        p.category ?? null,
        p.address ?? null,
        p.phone ?? null,
        p.website ?? null,
        p.email ?? null,
        p.googleMapsUrl ?? null,
        p.rating ?? null,
        p.reviewsCount ?? null,
        p.businessStatus ?? null,
        p.lat,
        p.lng,
        JSON.stringify(p.raw ?? {}),
        p.instagram ?? null,
      ],
    );
    if (row?.inserted) created++;
  }
  return created;
}

/** Recorre las próximas `quota` localidades pendientes de la región activa. */
export async function mapNextLocalities(quota: number, source: ProspectSource, log: AgentLog = () => {}) {
  const niche = await activeNiche();
  const results: { locality: string; found: number; created: number; error?: string }[] = [];
  for (let i = 0; i < quota; i++) {
    const loc = await nextLocality();
    if (!loc) {
      log("No quedan localidades pendientes en ninguna región");
      break;
    }
    await q("UPDATE localities SET status = 'mapping', niche_key = $2 WHERE id = $1", [loc.id, niche.key]);
    try {
      const places = await source.discover(loc, niche);
      const created = await saveDiscovered(loc, niche, places);
      const total = (await one<{ n: number }>("SELECT count(*)::int AS n FROM prospects WHERE locality_id = $1", [loc.id]))!.n;
      await q(
        "UPDATE localities SET status = 'mapped', mapped_at = now(), prospects_found = $2, last_error = NULL WHERE id = $1",
        [loc.id, total],
      );
      log(`${loc.name}: ${places.length} encontrados, ${created} nuevos`);
      results.push({ locality: loc.name, found: places.length, created });
    } catch (e) {
      const msg = (e as Error).message;
      await q("UPDATE localities SET status = 'failed', last_error = $2 WHERE id = $1", [loc.id, msg]);
      log(`${loc.name}: error ${msg}`);
      results.push({ locality: loc.name, found: 0, created: 0, error: msg });
    }
  }
  return results;
}

/** Próxima localidad pendiente; si la región activa terminó, activa la siguiente. */
export async function nextLocality(): Promise<LocalityRow | null> {
  for (let guard = 0; guard < 50; guard++) {
    const region = await one<{ id: number }>("SELECT id FROM regions WHERE status = 'active' ORDER BY position LIMIT 1");
    if (!region) {
      const next = await one<{ id: number }>(
        "UPDATE regions SET status = 'active' WHERE id = (SELECT id FROM regions WHERE status = 'queued' ORDER BY position LIMIT 1) RETURNING id",
      );
      if (!next) return null;
      continue;
    }
    const loc = await one<LocalityRow>(
      `SELECT id, region_id, name, osm_id, boundary, bbox, centroid_lat, centroid_lng, status
       FROM localities WHERE region_id = $1 AND status = 'pending'
       ORDER BY distance_km NULLS LAST, id LIMIT 1`,
      [region.id],
    );
    if (loc) return loc;
    await q("UPDATE regions SET status = 'done' WHERE id = $1", [region.id]);
  }
  return null;
}

/**
 * Enlace público de búsqueda en Google Maps (URL oficial "Maps URLs": gratis, sin clave ni API).
 * Es solo un link para que una persona abra la ficha y lea las reseñas; la app no descarga nada de ahí.
 */
export function mapsSearchUrl(name: string, where?: string | null): string {
  const query = [name, where].filter(Boolean).join(" ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
