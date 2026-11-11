/**
 * Agentes 6–12 y mejoras de los agentes existentes.
 *  6 · Detector de WhatsApp        → classifyPhones()
 *  7 · Priorizador diario          → dailyDigest()
 *  8 · Vigilante de aperturas      → watchOpenings()
 *  9 · Canal alternativo           → (UI: email / Instagram en la ficha)
 * 10 · Asistente de respuestas     → (UI + replyPrompt en extras)
 * 11 · Reactivador                 → reactivationCandidates() / reactivate()
 * 12 · Calendario de temporada     → refreshSeason() / seasonInfo()
 * Mejoras: Wikidata + Nominatim (Agente 2), mejor horario (Agente 2), resumen de reunión (Agente 4),
 *          borrador de caso de éxito al cerrar cliente (Agente 5).
 */
import { getSetting, one, q, setSetting } from "../db";
import { logActivity, setStage } from "../crm";
import { notify } from "../notify";
import { phoneType, localSeasonDates, seasonAdvice } from "../extras";
import { reverseAddress, reverseArea, spainHolidays, wikidataInfo } from "../enrich";
import { rescore } from "../score-store";
import { activeNiche, saveDiscoveredLimited, sourceFromSettings } from "./agent1-mapper";
import type { AgentLog, LocalityRow } from "./types";

// ---------- 6 · Detector de WhatsApp ----------
export async function classifyPhones(log: AgentLog = () => {}) {
  const rows = await q<{ id: number; phone: string | null; phone_type: string }>("SELECT id, phone, phone_type FROM prospects");
  let changed = 0;
  for (const r of rows) {
    const t = phoneType(r.phone);
    if (t !== r.phone_type) {
      await q("UPDATE prospects SET phone_type = $2 WHERE id = $1", [r.id, t]);
      changed++;
    }
  }
  log(`Teléfonos clasificados: ${changed} actualizados`);
  return { changed };
}

// ---------- 7 · Priorizador diario ----------
export type DigestItem = {
  id: number;
  name: string;
  locality: string | null;
  score: number | null;
  phone: string | null;
  phone_type: string;
  reason: "follow_up" | "new_opening" | "ready";
  message: string | null;
};

export async function dailyDigest(size?: number): Promise<DigestItem[]> {
  const n = size ?? (await getSetting<number>("daily_digest_size", 10));
  return q<DigestItem>(
    `SELECT p.id, p.name, l.name AS locality, p.score, p.phone, p.phone_type,
       CASE WHEN p.stage = 'contacted' THEN 'follow_up' WHEN p.is_new_opening THEN 'new_opening' ELSE 'ready' END AS reason,
       (SELECT content FROM outputs o WHERE o.prospect_id = p.id AND o.kind = 'message' AND o.content IS NOT NULL
        ORDER BY created_at DESC, id DESC LIMIT 1) AS message
     FROM prospects p LEFT JOIN localities l ON l.id = p.locality_id
     WHERE p.status <> 'discarded' AND NOT p.do_not_contact AND p.duplicate_of IS NULL
       AND ((p.stage = 'contacted' AND p.next_follow_up_at <= now() + interval '12 hours')
         OR (p.stage = 'to_contact' AND EXISTS (SELECT 1 FROM outputs o WHERE o.prospect_id = p.id AND o.kind = 'message' AND o.content IS NOT NULL)))
     ORDER BY (p.stage = 'contacted') DESC, p.is_new_opening DESC, (p.phone_type = 'mobile') DESC, p.score DESC NULLS LAST, p.id
     LIMIT $1`,
    [n],
  );
}

export async function sendDigest(log: AgentLog = () => {}) {
  const items = await dailyDigest();
  const sent = await notify("daily_digest", {
    total: items.length,
    items: items.map((i) => ({ id: i.id, name: i.name, locality: i.locality, score: i.score, reason: i.reason, whatsapp: i.phone_type === "mobile" })),
  });
  log(`Priorizador: ${items.length} prospectos para hoy${sent ? " (enviado a n8n)" : ""}`);
  return { items: items.length, sent };
}

// ---------- 8 · Vigilante de aperturas ----------
export async function watchOpenings(log: AgentLog = () => {}, limit = 15) {
  const days = await getSetting<number>("watch_openings_days", 30);
  const locs = await q<LocalityRow>(
    `SELECT id, region_id, name, osm_id, boundary, bbox, centroid_lat, centroid_lng, status FROM localities
     WHERE status = 'mapped' AND mapped_at < now() - ($1 || ' days')::interval ORDER BY mapped_at LIMIT $2`,
    [String(days), limit],
  );
  if (!locs.length) {
    log("Vigilante: no hay localidades para revisar todavía");
    return { checked: 0, found: 0 };
  }
  const niche = await activeNiche();
  const source = await sourceFromSettings();
  let found = 0;
  for (const loc of locs) {
    try {
      const before = new Date();
      const places = await source.discover(loc, niche);
      const { created } = await saveDiscoveredLimited(loc, niche, places, Infinity);
      if (created) {
        const ids = await q<{ id: number; name: string }>(
          "UPDATE prospects SET is_new_opening = true WHERE locality_id = $1 AND created_at >= $2 RETURNING id, name",
          [loc.id, before],
        );
        for (const p of ids) {
          await logActivity(p.id, null, "note", { body: "Nuevo en la zona (detectado por el Vigilante de aperturas)" });
          await rescore(p.id);
        }
        found += created;
        log(`${loc.name}: ${created} alojamientos nuevos`);
      }
      await q("UPDATE localities SET mapped_at = now() WHERE id = $1", [loc.id]);
    } catch (e) {
      log(`${loc.name}: ${(e as Error).message}`);
    }
  }
  if (found) void notify("new_openings", { found, localities: locs.length });
  log(`Vigilante: ${locs.length} localidades revisadas, ${found} aperturas nuevas`);
  return { checked: locs.length, found };
}

// ---------- 11 · Reactivador ----------
export type ReactivationRow = { id: number; name: string; locality: string | null; stage: string; last: string; pains: string[]; variant: string | null };

export async function reactivationCandidates(): Promise<ReactivationRow[]> {
  const days = await getSetting<number>("reactivate_after_days", 75);
  return q<ReactivationRow>(
    `SELECT p.id, p.name, l.name AS locality, p.stage, COALESCE(p.stage_changed_at, p.contacted_at)::text AS last,
       p.pain_tags AS pains, p.message_variant AS variant
     FROM prospects p LEFT JOIN localities l ON l.id = p.locality_id
     WHERE NOT p.do_not_contact AND p.duplicate_of IS NULL AND p.contacted_at IS NOT NULL
       AND (p.stage = 'lost' OR (p.stage = 'contacted' AND p.next_follow_up_at IS NULL))
       AND COALESCE(p.reactivated_at, p.contacted_at) < now() - ($1 || ' days')::interval
       AND NOT EXISTS (SELECT 1 FROM activities a WHERE a.prospect_id = p.id AND a.to_stage IN ('replied','meeting','client'))
     ORDER BY p.score DESC NULLS LAST LIMIT 50`,
    [String(days)],
  );
}

/** Vuelve a "Por contactar" con otra variante del mensaje y deja registro. */
export async function reactivate(prospectId: number, userId: number) {
  const p = await one<{ message_variant: string | null }>("SELECT message_variant FROM prospects WHERE id = $1", [prospectId]);
  const other = await one<{ key: string }>(
    "SELECT key FROM message_variants WHERE active AND key <> COALESCE($1, '') ORDER BY random() LIMIT 1",
    [p?.message_variant ?? null],
  );
  await q(
    `UPDATE prospects SET reactivated_at = now(), follow_ups_sent = 0, next_follow_up_at = NULL,
       message_variant = COALESCE($2, message_variant), status = CASE WHEN status = 'discarded' THEN 'enriched' ELSE status END
     WHERE id = $1`,
    [prospectId, other?.key ?? null],
  );
  await setStage(prospectId, "to_contact", userId, "Reactivado con otro enfoque");
}

// ---------- 12 · Calendario de temporada ----------
export async function refreshSeason(log: AgentLog = () => {}, fetchImpl?: typeof fetch) {
  const year = new Date().getUTCFullYear();
  let holidays = 0;
  for (const y of [year, year + 1]) {
    for (const s of localSeasonDates(y))
      await q("INSERT INTO season_dates (day, name, kind) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [s.day, s.name, s.kind]);
    try {
      for (const h of await spainHolidays(y, fetchImpl)) {
        await q("INSERT INTO season_dates (day, name, kind, source) VALUES ($1,$2,'holiday','nager') ON CONFLICT DO NOTHING", [h.day, h.name]);
        holidays++;
      }
    } catch (e) {
      log(`Feriados ${y}: ${(e as Error).message}`);
    }
  }
  await setSetting("season_refreshed_at", new Date().toISOString());
  log(`Temporada: ${holidays} feriados cargados`);
  return { holidays };
}

export async function seasonInfo() {
  const dates = await q<{ day: string; name: string; kind: string }>(
    "SELECT to_char(day, 'YYYY-MM-DD') AS day, name, kind FROM season_dates WHERE day >= current_date ORDER BY day LIMIT 60",
  );
  const advice = seasonAdvice(dates.filter((d) => d.kind !== "holiday" || /Semana Santa|Viernes Santo|Jueves Santo|Navidad/i.test(d.name)));
  return { dates, advice };
}

// ---------- Agente 2 · Barrio de cada prospecto (OpenStreetMap / Nominatim) ----------
/** Completa el barrio de los prospectos que todavía no lo tienen (1 pedido por segundo, gratis). */
export async function fillAreas(log: AgentLog = () => {}, limit = 60, fetchImpl?: typeof fetch) {
  const rows = await q<{ id: number; name: string; lat: number; lng: number }>(
    `SELECT id, name, lat, lng FROM prospects WHERE area IS NULL AND lat IS NOT NULL AND lng IS NOT NULL
     ORDER BY score DESC NULLS LAST, id LIMIT $1`,
    [limit],
  );
  let found = 0;
  for (const r of rows) {
    try {
      const area = await reverseArea(r.lat, r.lng, fetchImpl);
      await q("UPDATE prospects SET area = $2, updated_at = now() WHERE id = $1", [r.id, area ?? ""]);
      if (area) found++;
    } catch (e) {
      log(`${r.name}: ${(e as Error).message}`);
      if (/429|403/.test((e as Error).message)) break; // límite de Nominatim: seguir en la próxima corrida
    }
  }
  const left = (await one<{ n: number }>("SELECT count(*)::int AS n FROM prospects WHERE area IS NULL AND lat IS NOT NULL"))?.n ?? 0;
  log(`Barrios: ${found} encontrados de ${rows.length} revisados${left ? ` · quedan ${left} (siguen en la próxima corrida)` : ""}`);
  return { checked: rows.length, found, left };
}

// ---------- Mejora Agente 2 · Wikidata + Nominatim ----------
export async function enrichOpenData(log: AgentLog = () => {}, limit = 40, fetchImpl?: typeof fetch) {
  const rows = await q<{ id: number; raw: { tags?: Record<string, string> }; address: string | null; lat: number | null; lng: number | null; website: string | null; instagram: string | null; facebook: string | null; brand: string | null }>(
    `SELECT id, raw, address, lat, lng, website, instagram, facebook, brand FROM prospects
     WHERE enriched_at IS NULL AND duplicate_of IS NULL ORDER BY score DESC NULLS LAST, id LIMIT $1`,
    [limit],
  );
  let wiki = 0, addr = 0;
  for (const r of rows) {
    try {
      const qid = r.raw?.tags?.wikidata ?? r.raw?.tags?.["brand:wikidata"];
      if (qid) {
        const w = await wikidataInfo(qid, fetchImpl);
        if (w) {
          await q(
            `UPDATE prospects SET wikidata_id = $2, website = COALESCE(website, $3), instagram = COALESCE(instagram, $4),
               facebook = COALESCE(facebook, $5), brand = COALESCE(brand, CASE WHEN $6 THEN 'cadena' END), updated_at = now() WHERE id = $1`,
            [r.id, qid, w.website ?? null, w.instagram ?? null, w.facebook ?? null, w.chain],
          );
          wiki++;
        }
      }
      if (!r.address && r.lat !== null && r.lng !== null) {
        const a = await reverseAddress(r.lat, r.lng, fetchImpl);
        if (a) {
          await q("UPDATE prospects SET address = $2, updated_at = now() WHERE id = $1 AND address IS NULL", [r.id, a]);
          addr++;
        }
      }
      await q("UPDATE prospects SET enriched_at = now() WHERE id = $1", [r.id]);
      await rescore(r.id);
    } catch (e) {
      log(`#${r.id}: ${(e as Error).message}`);
    }
  }
  log(`Datos abiertos: ${wiki} con Wikidata, ${addr} direcciones completadas (de ${rows.length})`);
  return { processed: rows.length, wikidata: wiki, addresses: addr };
}

// ---------- Mejora Agente 5 · Borrador de caso de éxito ----------
export async function draftCaseStudy(prospectId: number) {
  const exists = await one("SELECT 1 FROM case_studies WHERE prospect_id = $1", [prospectId]);
  if (exists) return null;
  const p = await one<{ name: string; category: string | null; locality: string | null; pain_tags: string[] }>(
    `SELECT p.name, p.category, l.name AS locality, p.pain_tags FROM prospects p LEFT JOIN localities l ON l.id = p.locality_id WHERE p.id = $1`,
    [prospectId],
  );
  if (!p) return null;
  const report = await one<{ content: string }>(
    "SELECT content FROM outputs WHERE prospect_id = $1 AND kind = 'report' AND content IS NOT NULL ORDER BY created_at DESC, id DESC LIMIT 1",
    [prospectId],
  );
  const idea = report?.content.match(/Solución:\s*\n?([^\n]+)/)?.[1]?.trim();
  const problem = report?.content.match(/Problema:\s*\n?([^\n]+)/)?.[1]?.trim();
  const kind = p.category?.toLowerCase().includes("hotel") ? "un hotel" : "un alojamiento";
  return one<{ id: number }>(
    `INSERT INTO case_studies (title, tags, summary, result, draft, prospect_id) VALUES ($1,$2,$3,$4,true,$5) RETURNING id`,
    [
      `${p.name}${p.locality ? ` · ${p.locality}` : ""}`,
      p.pain_tags,
      [problem && `Problema: ${problem}`, idea && `Qué hicimos: ${idea}`].filter(Boolean).join(" · ") || "Completar: problema, qué hicimos y en cuánto tiempo.",
      `${kind}${p.locality ? ` de ${p.locality}` : ""} a [completar resultado medible]`,
      prospectId,
    ],
  );
}
