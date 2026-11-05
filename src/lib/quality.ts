/**
 * Calidad de datos: duplicados y lista "no contactar" (RGPD).
 */
import { one, q } from "./db";
import { haversineKm } from "./geo/geometry";
import { logActivity } from "./crm";

/** "Hotel Sol & Mar, S.L." → "sol mar" (sin tildes, sin palabras genéricas). */
export function nameKey(name: string): string {
  const stop = new Set(["hotel", "hostal", "hostel", "apartamentos", "apartamento", "pension", "the", "el", "la", "los", "las", "de", "del", "y", "sl", "sa"]);
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w && !stop.has(w))
    .join(" ");
}

export function phoneKey(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let d = phone.split(/[;,/]/)[0].replace(/\D/g, "").replace(/^00/, "");
  if (d.length === 9) d = `34${d}`;
  return d.length >= 10 ? d : null;
}

/** ¿Son el mismo negocio? Mismo teléfono, o nombre equivalente a menos de 150 m. */
export function isSameBusiness(
  a: { name: string; phone?: string | null; lat?: number | null; lng?: number | null },
  b: { name: string; phone?: string | null; lat?: number | null; lng?: number | null },
): boolean {
  const pa = phoneKey(a.phone);
  if (pa && pa === phoneKey(b.phone)) return true;
  const na = nameKey(a.name);
  const nb = nameKey(b.name);
  if (!na || !nb) return false;
  const similar = na === nb || (Math.min(na.length, nb.length) >= 5 && (na.includes(nb) || nb.includes(na)));
  if (!similar) return false;
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return na === nb;
  return haversineKm([a.lng, a.lat], [b.lng, b.lat]) <= 0.15;
}

/** Busca un prospecto existente que sea el mismo negocio (para no duplicar al mapear). */
export async function findExisting(p: { name: string; phone?: string | null; lat?: number | null; lng?: number | null }) {
  const d = 0.002; // ~200 m
  const near =
    p.lat != null && p.lng != null
      ? await q<{ id: number; name: string; phone: string | null; lat: number | null; lng: number | null }>(
          `SELECT id, name, phone, lat, lng FROM prospects
           WHERE duplicate_of IS NULL AND lat BETWEEN $1 AND $2 AND lng BETWEEN $3 AND $4`,
          [p.lat - d, p.lat + d, p.lng - d, p.lng + d],
        )
      : [];
  const pk = phoneKey(p.phone);
  const byPhone = pk
    ? await q<{ id: number; name: string; phone: string | null; lat: number | null; lng: number | null }>(
        "SELECT id, name, phone, lat, lng FROM prospects WHERE duplicate_of IS NULL AND phone IS NOT NULL AND regexp_replace(phone, '\\D', '', 'g') LIKE '%' || right($1, 9)",
        [pk],
      )
    : [];
  return [...near, ...byPhone].find((x) => isSameBusiness(p, x)) ?? null;
}

/** Marca como duplicados los prospectos repetidos ya guardados (se queda el más completo/antiguo). */
export async function dedupeAll(): Promise<number> {
  const rows = await q<{ id: number; name: string; phone: string | null; lat: number | null; lng: number | null; filled: number }>(
    `SELECT id, name, phone, lat, lng,
       (phone IS NOT NULL)::int + (website IS NOT NULL)::int + (email IS NOT NULL)::int + (stage <> 'to_contact')::int * 5 AS filled
     FROM prospects WHERE duplicate_of IS NULL ORDER BY filled DESC, id`,
  );
  let marked = 0;
  const kept: typeof rows = [];
  for (const r of rows) {
    const dup = kept.find((k) => isSameBusiness(r, k));
    if (!dup) {
      kept.push(r);
      continue;
    }
    await q("UPDATE prospects SET duplicate_of = $2, status = 'discarded', updated_at = now() WHERE id = $1", [r.id, dup.id]);
    await logActivity(r.id, null, "note", { body: `Duplicado de #${dup.id} (${dup.name})` });
    marked++;
  }
  return marked;
}

export async function isBlocked(p: { name: string; phone?: string | null }): Promise<boolean> {
  const pk = phoneKey(p.phone);
  const nk = nameKey(p.name);
  const row = await one(
    "SELECT 1 FROM do_not_contact WHERE (phone IS NOT NULL AND phone = $1) OR (name_key IS NOT NULL AND name_key = $2) LIMIT 1",
    [pk, nk || null],
  );
  return !!row;
}

/** Agrega a "no contactar" y descarta el prospecto. */
export async function blockProspect(prospectId: number, userId: number, reason: string) {
  const p = await one<{ name: string; phone: string | null }>("SELECT name, phone FROM prospects WHERE id = $1", [prospectId]);
  if (!p) throw new Error("Prospecto inexistente");
  await q("INSERT INTO do_not_contact (phone, name_key, reason, created_by) VALUES ($1,$2,$3,$4)", [
    phoneKey(p.phone),
    nameKey(p.name) || null,
    reason || null,
    userId,
  ]);
  await q(
    `UPDATE prospects SET do_not_contact = true, stage = 'lost', next_follow_up_at = NULL, audit_slug = NULL,
       stage_changed_at = now(), updated_at = now() WHERE id = $1`,
    [prospectId],
  );
  await logActivity(prospectId, userId, "note", { body: `No contactar${reason ? `: ${reason}` : ""}` });
}

export async function unblockProspect(prospectId: number, userId: number) {
  const p = await one<{ name: string; phone: string | null }>("SELECT name, phone FROM prospects WHERE id = $1", [prospectId]);
  if (!p) return;
  await q("DELETE FROM do_not_contact WHERE phone = $1 OR name_key = $2", [phoneKey(p.phone), nameKey(p.name) || null]);
  await q("UPDATE prospects SET do_not_contact = false, updated_at = now() WHERE id = $1", [prospectId]);
  await logActivity(prospectId, userId, "note", { body: "Quitado de 'no contactar'" });
}
