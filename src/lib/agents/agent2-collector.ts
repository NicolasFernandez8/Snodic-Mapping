/**
 * AGENTE 2 — Recopilación y almacenamiento de datos.
 * Completa cada prospecto nuevo con los datos disponibles por API oficial (teléfono, web,
 * enlace de reseñas y reseñas) y lo registra en Notion. Lo que no se encuentra queda como "-"
 * para que se complete a mano.
 */
import { config } from "../config";
import { one, q } from "../db";
import { EMPTY, NotionClient, type ProspectFields } from "../notion";
import { PlacesClient, type PlaceDetails } from "../sources/places";
import type { AgentLog, ProspectRow } from "./types";
import { mapsSearchUrl } from "./agent1-mapper";

export const PROSPECT_COLUMNS = `p.id, p.locality_id, p.niche_key, p.source, p.source_id, p.name, p.category, p.address, p.phone,
  p.website, p.email, p.instagram, p.facebook, p.business_days, p.business_hours, p.google_maps_url, p.reviews_url, p.rating, p.reviews_count, p.lat, p.lng,
  p.status, p.notion_page_id, p.notion_blocks, p.raw`;

/** Enlace de reseñas: el de la API o, si no hay, la ficha de Maps. */
export function reviewsLink(p: Pick<ProspectRow, "reviews_url" | "google_maps_url">): string {
  return p.reviews_url || p.google_maps_url || "";
}

export function instagramFromWebsite(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /instagram\.com\/([A-Za-z0-9_.]+)/i.exec(url);
  return m ? `https://instagram.com/${m[1]}` : null;
}

async function saveDetails(p: ProspectRow, d: PlaceDetails) {
  const website = d.website ?? p.website;
  await q(
    `UPDATE prospects SET phone = COALESCE($2, phone), website = COALESCE($3, website),
       reviews_url = COALESCE($4, reviews_url), google_maps_url = COALESCE($5, google_maps_url),
       rating = COALESCE($6, rating), reviews_count = COALESCE($7, reviews_count),
       address = COALESCE(address, $8), instagram = COALESCE(instagram, $9),
       raw = raw || jsonb_build_object('google_place_id', $10::text), updated_at = now()
     WHERE id = $1`,
    [
      p.id,
      d.phone ?? null,
      website ?? null,
      d.reviewsUrl ?? null,
      d.googleMapsUrl ?? null,
      d.rating ?? null,
      d.reviewsCount ?? null,
      d.address ?? null,
      instagramFromWebsite(website),
      d.id,
    ],
  );
  for (const r of d.reviews) {
    await q(
      `INSERT INTO reviews (prospect_id, author, rating, text, published_at, language)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
      [p.id, r.author ?? null, r.rating ?? null, r.text, r.publishedAt ?? null, r.language ?? null],
    );
  }
}

/** Para prospectos de OSM: intenta encontrar la ficha de Google para obtener reseñas. */
async function findGooglePlace(client: PlacesClient, p: ProspectRow, localityName: string) {
  if (p.lat === null || p.lng === null) return null;
  const d = 0.003; // ~300 m
  const res = await client.textSearch(`${p.name} ${localityName}`, [p.lng - d, p.lat - d, p.lng + d, p.lat + d]);
  return res[0]?.id ?? null;
}

export async function collectData(limit = 50, log: AgentLog = () => {}, places?: PlacesClient | null) {
  const client = places === undefined ? (config().GOOGLE_MAPS_API_KEY ? PlacesClient.fromConfig() : null) : places;
  const rows = await q<ProspectRow & { locality_name: string | null }>(
    `SELECT ${PROSPECT_COLUMNS}, l.name AS locality_name FROM prospects p
     LEFT JOIN localities l ON l.id = p.locality_id
     WHERE p.status = 'new' ORDER BY p.id LIMIT $1`,
    [limit],
  );
  let enriched = 0;
  for (const p of rows) {
    try {
      if (client) {
        const placeId =
          p.source === "google_places"
            ? p.source_id
            : ((p.raw.google_place_id as string | undefined) ?? (await findGooglePlace(client, p, p.locality_name ?? "")));
        if (placeId) await saveDetails(p, await client.details(placeId));
      }
      // Modo gratuito: link público de Google Maps para abrir la ficha y leer las reseñas a mano.
      if (!p.google_maps_url) {
        await q("UPDATE prospects SET google_maps_url = $2 WHERE id = $1 AND google_maps_url IS NULL", [
          p.id,
          mapsSearchUrl(p.name, p.address || p.locality_name),
        ]);
      }
      await q("UPDATE prospects SET status = 'enriched', updated_at = now() WHERE id = $1", [p.id]);
      enriched++;
    } catch (e) {
      log(`${p.name}: ${(e as Error).message}`);
    }
  }
  log(`${enriched}/${rows.length} prospectos completados`);
  return { processed: rows.length, enriched };
}

export async function notionFields(id: number): Promise<ProspectFields> {
  const p = await one<ProspectRow & { locality_name: string | null; region_name: string | null }>(
    `SELECT ${PROSPECT_COLUMNS}, l.name AS locality_name, r.name AS region_name
     FROM prospects p LEFT JOIN localities l ON l.id = p.locality_id LEFT JOIN regions r ON r.id = l.region_id
     WHERE p.id = $1`,
    [id],
  );
  if (!p) throw new Error(`Prospecto ${id} inexistente`);
  return {
    name: p.name,
    business_days: p.business_days,
    business_hours: p.business_hours,
    rating: p.rating === null ? null : Number(p.rating),
    // Ready: tiene mensaje (Agente 3) e informe (Agente 4) listos para contactar.
    ready: p.status === "report_ready" || p.status === "synced",
    locality: p.locality_name,
    website: p.website,
    phone: formatPhone(p.phone),
    address: p.address,
    contact_info: contactInfo(p),
    region: p.region_name,
    category: p.category,
    email: p.email,
    type: "Normal",
    google_maps_url: p.google_maps_url,
  };
}

/** Crea o actualiza en Notion los prospectos con datos completados. */
export async function syncProspectsToNotion(limit = 50, log: AgentLog = () => {}, notion = NotionClient.fromConfig()) {
  if (!notion) {
    log("Notion no configurado (NOTION_TOKEN / NOTION_DATABASE_ID): se omite la sincronización");
    return { synced: 0, skipped: true };
  }
  const rows = await q<{ id: number; name: string; notion_page_id: string | null }>(
    `SELECT id, name, notion_page_id FROM prospects
     WHERE status IN ('enriched','message_ready','report_ready','synced')
       AND (notion_synced_at IS NULL OR notion_synced_at < updated_at)
     ORDER BY id LIMIT $1`,
    [limit],
  );
  let synced = 0;
  const missingProps = new Set<string>();
  for (const r of rows) {
    try {
      const { pageId, missing } = await notion.upsertProspect(r.notion_page_id, await notionFields(r.id));
      missing.forEach((m) => missingProps.add(m));
      await q("UPDATE prospects SET notion_page_id = $2, notion_synced_at = now() + interval '1 second' WHERE id = $1", [
        r.id,
        pageId,
      ]);
      synced++;
    } catch (e) {
      log(`${r.name}: ${(e as Error).message}`);
    }
  }
  if (missingProps.size)
    log(`Propiedades no encontradas en la base de Notion (revisar NOTION_PROPERTY_MAP): ${[...missingProps].join(", ")}`);
  log(`${synced} prospectos sincronizados con Notion`);
  return { synced, missingProperties: [...missingProps] };
}

export { EMPTY };

/**
 * Reseñas cargadas a mano (copiadas de Google Maps por una persona).
 * Formato: una reseña por bloque separado por línea vacía. Opcional al inicio "5★" o "5/5" o "5 estrellas".
 */
export function parsePastedReviews(text: string): { rating: number | null; text: string }[] {
  return text
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => {
      const m = /^\s*([1-5])\s*(?:★|\/\s*5|estrellas?)\s*[:\-–]?\s*/i.exec(b);
      return m ? { rating: Number(m[1]), text: b.slice(m[0].length).trim() } : { rating: null, text: b };
    })
    .filter((r) => r.text.length > 0);
}

export async function saveManualReviews(prospectId: number, text: string, replace = false) {
  const reviews = parsePastedReviews(text);
  if (replace) await q("DELETE FROM reviews WHERE prospect_id = $1", [prospectId]);
  for (const r of reviews) {
    await q(
      "INSERT INTO reviews (prospect_id, author, rating, text) VALUES ($1, 'manual', $2, $3) ON CONFLICT DO NOTHING",
      [prospectId, r.rating, r.text],
    );
  }
  return reviews.length;
}

/** "+34 624 20 72 88" → "34624207288" (formato usado en la base de Snodic). */
export function formatPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const first = phone.split(/[;,/]/)[0];
  const digits = first.replace(/\D/g, "").replace(/^00/, "");
  if (!digits) return null;
  return digits.length === 9 ? `34${digits}` : digits; // números españoles sin prefijo
}

/** Redes sociales separadas por " [] " como en la base de Snodic. */
export function contactInfo(p: { instagram: string | null; facebook: string | null }): string | null {
  const parts = [p.instagram, p.facebook]
    .filter((x): x is string => !!x && x.trim() !== "")
    .map((x) => (x.startsWith("http") ? x : x.startsWith("@") ? `https://www.instagram.com/${x.slice(1)}/` : x));
  return parts.length ? parts.join(" [] ") : null;
}
