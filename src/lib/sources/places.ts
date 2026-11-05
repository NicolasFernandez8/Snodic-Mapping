/**
 * Google Places API (New) — API oficial. Requiere GOOGLE_MAPS_API_KEY con "Places API (New)" habilitada.
 * Text Search devuelve hasta 60 resultados (3 páginas de 20); si se llega al tope se subdivide el área.
 * Place Details devuelve como máximo 5 reseñas por lugar (limitación de Google).
 * Respetá los términos de Google Maps Platform sobre almacenamiento de contenido.
 */
import { config } from "../config";
import { splitBbox } from "../geo/geometry";

const BASE = "https://places.googleapis.com/v1";

export type PlaceSummary = {
  id: string;
  name: string;
  types: string[];
  primaryType?: string;
  address?: string;
  lat?: number;
  lng?: number;
  rating?: number;
  reviewsCount?: number;
  googleMapsUrl?: string;
  businessStatus?: string;
};

export type PlaceReview = {
  author?: string;
  rating?: number;
  text: string;
  publishedAt?: string;
  language?: string;
};

export type PlaceDetails = PlaceSummary & {
  phone?: string;
  website?: string;
  reviewsUrl?: string;
  reviews: PlaceReview[];
};

const SEARCH_FIELDS = [
  "places.id",
  "places.displayName",
  "places.types",
  "places.primaryType",
  "places.formattedAddress",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.googleMapsUri",
  "places.businessStatus",
  "nextPageToken",
].join(",");

const DETAIL_FIELDS = [
  "id",
  "displayName",
  "types",
  "primaryType",
  "formattedAddress",
  "location",
  "rating",
  "userRatingCount",
  "googleMapsUri",
  "googleMapsLinks",
  "businessStatus",
  "internationalPhoneNumber",
  "nationalPhoneNumber",
  "websiteUri",
  "reviews",
].join(",");

type FetchLike = typeof fetch;

export class PlacesClient {
  constructor(
    private apiKey: string,
    private fetchImpl: FetchLike = fetch,
    private delayMs = 300,
  ) {}

  static fromConfig(): PlacesClient {
    const key = config().GOOGLE_MAPS_API_KEY;
    if (!key) throw new Error("Falta GOOGLE_MAPS_API_KEY para usar Google Places");
    return new PlacesClient(key);
  }

  private async call<T>(url: string, init: RequestInit, fieldMask: string): Promise<T> {
    const res = await this.fetchImpl(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": this.apiKey,
        "X-Goog-FieldMask": fieldMask,
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) throw new Error(`Places API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return (await res.json()) as T;
  }

  /** Una búsqueda paginada (máx. 60). */
  async textSearch(
    textQuery: string,
    rect: [number, number, number, number],
  ): Promise<PlaceSummary[]> {
    const out: PlaceSummary[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < 3; page++) {
      const body: Record<string, unknown> = {
        textQuery,
        languageCode: "es",
        regionCode: "ES",
        pageSize: 20,
        locationRestriction: {
          rectangle: { low: { latitude: rect[1], longitude: rect[0] }, high: { latitude: rect[3], longitude: rect[2] } },
        },
      };
      if (pageToken) body.pageToken = pageToken;
      const json = await this.call<{ places?: RawPlace[]; nextPageToken?: string }>(
        `${BASE}/places:searchText`,
        { method: "POST", body: JSON.stringify(body) },
        SEARCH_FIELDS,
      );
      out.push(...(json.places ?? []).map(mapPlace));
      pageToken = json.nextPageToken;
      if (!pageToken) break;
      await sleep(this.delayMs);
    }
    return out;
  }

  /**
   * Busca todos los lugares de un área. Si una celda da 60 resultados (tope de Google),
   * la divide en 4 y repite, hasta `maxDepth`.
   */
  async searchArea(
    textQuery: string,
    rect: [number, number, number, number],
    maxDepth = 2,
  ): Promise<PlaceSummary[]> {
    const found = new Map<string, PlaceSummary>();
    const walk = async (r: [number, number, number, number], depth: number) => {
      const res = await this.textSearch(textQuery, r);
      res.forEach((p) => found.set(p.id, p));
      if (res.length >= 60 && depth < maxDepth) {
        for (const sub of splitBbox(r, 2)) await walk(sub, depth + 1);
      }
    };
    await walk(rect, 0);
    return [...found.values()];
  }

  async details(placeId: string): Promise<PlaceDetails> {
    const raw = await this.call<RawPlace>(
      `${BASE}/places/${encodeURIComponent(placeId)}?languageCode=es&regionCode=ES`,
      { method: "GET" },
      DETAIL_FIELDS,
    );
    return {
      ...mapPlace(raw),
      phone: raw.internationalPhoneNumber ?? raw.nationalPhoneNumber,
      website: raw.websiteUri,
      reviewsUrl: raw.googleMapsLinks?.reviewsUri,
      reviews: (raw.reviews ?? [])
        .map((r) => ({
          author: r.authorAttribution?.displayName,
          rating: r.rating,
          text: r.originalText?.text ?? r.text?.text ?? "",
          publishedAt: r.publishTime,
          language: r.originalText?.languageCode ?? r.text?.languageCode,
        }))
        .filter((r) => r.text.trim().length > 0),
    };
  }
}

type RawPlace = {
  id: string;
  displayName?: { text: string };
  types?: string[];
  primaryType?: string;
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  googleMapsLinks?: { reviewsUri?: string };
  businessStatus?: string;
  internationalPhoneNumber?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  reviews?: {
    rating?: number;
    text?: { text: string; languageCode?: string };
    originalText?: { text: string; languageCode?: string };
    authorAttribution?: { displayName?: string };
    publishTime?: string;
  }[];
};

function mapPlace(p: RawPlace): PlaceSummary {
  return {
    id: p.id,
    name: p.displayName?.text ?? "(sin nombre)",
    types: p.types ?? [],
    primaryType: p.primaryType,
    address: p.formattedAddress,
    lat: p.location?.latitude,
    lng: p.location?.longitude,
    rating: p.rating,
    reviewsCount: p.userRatingCount,
    googleMapsUrl: p.googleMapsUri,
    businessStatus: p.businessStatus,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** ¿El lugar pertenece al rubro? Coincide si comparte algún tipo con el nicho. */
export function matchesNiche(place: Pick<PlaceSummary, "types" | "primaryType">, nicheTypes: string[]): boolean {
  if (!nicheTypes.length) return true;
  const set = new Set(nicheTypes);
  return (place.primaryType && set.has(place.primaryType)) || place.types.some((t) => set.has(t));
}
