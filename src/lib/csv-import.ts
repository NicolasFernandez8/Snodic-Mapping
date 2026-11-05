/**
 * Importa prospectos desde CSV (listas propias, Airbnb cargados a mano, exportaciones de Notion…).
 * Acepta los encabezados de la base de Notion de Snodic (Name, Phone, Address, Webpage…) o en español.
 */
import { createHash } from "node:crypto";
import { one, q } from "./db";
import { pointInArea, type Area } from "./geo/geometry";
import { findExisting, isBlocked } from "./quality";
import { mapsSearchUrl } from "./agents/agent1-mapper";
import { getSetting } from "./db";
import { logActivity } from "./crm";

/** CSV con comillas, comas o punto y coma, y saltos de línea dentro de campos. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

const ALIASES: Record<string, string[]> = {
  name: ["name", "nombre"],
  phone: ["phone", "telefono", "teléfono"],
  address: ["address", "direccion", "dirección"],
  website: ["webpage", "web", "website", "sitio web"],
  email: ["email", "correo"],
  category: ["category", "categoria", "categoría"],
  locality: ["location", "localidad"],
  instagram: ["instagram"],
  facebook: ["facebook"],
  google_maps_url: ["url google maps", "google maps"],
  rating: ["rating - google maps", "rating - google", "rating"],
  business_days: ["business days", "dias", "días"],
  business_hours: ["business hours", "horario"],
  lat: ["latitude", "latitud", "lat"],
  lng: ["longitude", "longitud", "lng", "lon"],
};

export function mapHeaders(headers: string[]): Record<string, number> {
  const norm = headers.map((h) => h.trim().toLowerCase());
  const out: Record<string, number> = {};
  for (const [field, names] of Object.entries(ALIASES)) {
    const i = norm.findIndex((h) => names.includes(h));
    if (i >= 0) out[field] = i;
  }
  return out;
}

const clean = (v: string | undefined) => {
  const s = (v ?? "").trim();
  return s && s !== "-" ? s : null;
};

export async function importProspectsCsv(text: string, userId: number) {
  const rows = parseCsv(text);
  if (rows.length < 2) return { created: 0, skipped: 0 };
  const h = mapHeaders(rows[0]);
  if (h.name === undefined) throw new Error('El CSV necesita una columna "Name" o "Nombre"');
  const niche = await getSetting<string>("active_niche", "hospitality");
  const locs = await q<{ id: number; name: string; boundary: Area | null }>("SELECT id, name, boundary FROM localities");
  let created = 0;
  let skipped = 0;
  for (const r of rows.slice(1)) {
    const get = (f: string) => (h[f] === undefined ? null : clean(r[h[f]]));
    const name = get("name");
    if (!name) {
      skipped++;
      continue;
    }
    const lat = get("lat") ? Number(get("lat")!.replace(",", ".")) : null;
    const lng = get("lng") ? Number(get("lng")!.replace(",", ".")) : null;
    const phone = get("phone");
    if (await findExisting({ name, phone, lat, lng })) {
      skipped++;
      continue;
    }
    const locName = get("locality");
    const loc =
      (lat !== null && lng !== null && locs.find((l) => l.boundary && pointInArea([lng, lat], l.boundary))) ||
      (locName && locs.find((l) => l.name.toLowerCase() === locName.toLowerCase())) ||
      null;
    const sourceId = createHash("sha1").update(`${name}|${get("address") ?? ""}|${phone ?? ""}`).digest("hex").slice(0, 20);
    const blocked = await isBlocked({ name, phone });
    const ratingRaw = get("rating");
    const row = await one<{ id: number }>(
      `INSERT INTO prospects (locality_id, niche_key, source, source_id, name, category, address, phone, website, email,
         instagram, facebook, google_maps_url, rating, business_days, business_hours, lat, lng, do_not_contact, stage, status, raw)
       VALUES ($1,$2,'manual',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
               CASE WHEN $18 THEN 'lost' ELSE 'to_contact' END, CASE WHEN $18 THEN 'discarded' ELSE 'new' END,
               jsonb_build_object('import', 'csv', 'locality_text', $19::text))
       ON CONFLICT (source, source_id) DO NOTHING RETURNING id`,
      [
        loc?.id ?? null,
        niche,
        sourceId,
        name,
        get("category"),
        get("address"),
        phone,
        get("website"),
        get("email"),
        get("instagram"),
        get("facebook"),
        get("google_maps_url") ?? mapsSearchUrl(name, get("address") ?? locName),
        ratingRaw && !Number.isNaN(Number(ratingRaw.replace(",", "."))) ? Number(ratingRaw.replace(",", ".")) : null,
        get("business_days"),
        get("business_hours"),
        lat,
        lng,
        blocked,
        locName,
      ],
    );
    if (!row) {
      skipped++;
      continue;
    }
    await logActivity(row.id, userId, "note", { body: "Importado desde CSV" });
    created++;
  }
  return { created, skipped };
}
