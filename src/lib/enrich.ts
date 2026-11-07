/**
 * Enriquecimiento con APIs oficiales y gratuitas (sin scraping):
 * - Wikidata (Special:EntityData): web oficial, Instagram, Facebook y si pertenece a una cadena.
 * - Nominatim (OpenStreetMap): dirección a partir de coordenadas. Política: 1 pedido/seg y User-Agent propio.
 * - Nager.Date: feriados públicos de España.
 * `fetchImpl` se puede reemplazar en tests.
 */
import { config } from "./config";

type F = typeof fetch;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type WikidataInfo = { website?: string; instagram?: string; facebook?: string; chain: boolean };

export async function wikidataInfo(qid: string, fetchImpl: F = fetch): Promise<WikidataInfo | null> {
  if (!/^Q\d+$/.test(qid)) return null;
  const res = await fetchImpl(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`, {
    headers: { "User-Agent": config().APP_USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { entities: Record<string, { claims?: Record<string, { mainsnak?: { datavalue?: { value?: unknown } } }[]> }> };
  const ent = Object.values(json.entities ?? {})[0];
  if (!ent?.claims) return null;
  const val = (p: string) => ent.claims![p]?.[0]?.mainsnak?.datavalue?.value;
  const str = (p: string) => (typeof val(p) === "string" ? (val(p) as string) : undefined);
  const insta = str("P2003");
  const fb = str("P2013");
  return {
    website: str("P856"),
    instagram: insta ? `https://www.instagram.com/${insta}/` : undefined,
    facebook: fb ? `https://www.facebook.com/${fb}` : undefined,
    // P749 = organización matriz, P127 = propietario → pertenece a una cadena/grupo
    chain: !!(ent.claims.P749?.length || ent.claims.P127?.length),
  };
}

let lastNominatim = 0;
export async function reverseAddress(lat: number, lng: number, fetchImpl: F = fetch): Promise<string | null> {
  const wait = 1100 - (Date.now() - lastNominatim);
  if (wait > 0 && fetchImpl === fetch) await sleep(wait);
  lastNominatim = Date.now();
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=es`;
  const res = await fetchImpl(url, { headers: { "User-Agent": config().APP_USER_AGENT } });
  if (!res.ok) return null;
  const j = (await res.json()) as { address?: Record<string, string> };
  const a = j.address;
  if (!a) return null;
  const street = [a.road ?? a.pedestrian ?? a.footway, a.house_number].filter(Boolean).join(" ");
  const city = a.city ?? a.town ?? a.village ?? a.municipality;
  const parts = [street, [a.postcode, city].filter(Boolean).join(" ")].filter((x) => x && x.trim());
  return parts.length ? parts.join(", ") : null;
}

export async function spainHolidays(year: number, fetchImpl: F = fetch): Promise<{ day: string; name: string }[]> {
  const res = await fetchImpl(`https://date.nager.at/api/v3/PublicHolidays/${year}/ES`, {
    headers: { "User-Agent": config().APP_USER_AGENT },
  });
  if (!res.ok) throw new Error(`Nager.Date respondió ${res.status}`);
  const list = (await res.json()) as { date: string; localName: string; global: boolean; counties: string[] | null }[];
  // Nacionales + Comunidad Valenciana (ES-VC)
  return list
    .filter((h) => h.global || (h.counties ?? []).includes("ES-VC"))
    .map((h) => ({ day: h.date, name: h.localName }));
}
