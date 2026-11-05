/**
 * Qué funciona: tasa de respuesta por característica del prospecto, calculada con los contactados reales.
 * Con suficientes datos (MIN_TOTAL contactados) también sugiere una búsqueda y ajusta el puntaje.
 */
import { one, q } from "./db";
import { cached } from "./cache";
import type { Filters } from "./filters";
import type { ScoreItem } from "./scoring";

export const MIN_TOTAL = 50; // contactados necesarios para sacar conclusiones
export const MIN_GROUP = 10; // contactados por grupo para tenerlo en cuenta

export type Segment = { dim: string; value: string; contacted: number; replied: number; rate: number };
export type Insights = { total: number; replied: number; rate: number; segments: Segment[]; enough: boolean };

const CONTACTED = `(p.contacted_at IS NOT NULL OR p.stage IN ('contacted','replied','meeting','client'))`;
const REPLIED = `(p.stage IN ('replied','meeting','client'))`;

/** Dimensiones: [nombre, expresión SQL del valor]. */
const DIMS: [string, string][] = [
  ["Categoría", "COALESCE(p.category, 'sin dato')"],
  ["Tipo", "CASE WHEN p.brand IS NULL THEN 'independiente' ELSE 'cadena' END"],
  ["Estrellas", "COALESCE(p.stars::text || '★', 'sin dato')"],
  ["Contacto", "CASE WHEN p.website IS NOT NULL THEN 'con web' ELSE 'sin web' END"],
  ["Redes", "CASE WHEN p.instagram IS NOT NULL OR p.facebook IS NOT NULL THEN 'con redes' ELSE 'sin redes' END"],
  ["Puntaje", "CASE WHEN p.score >= 60 THEN '60+' WHEN p.score >= 35 THEN '35–59' ELSE '<35' END"],
  ["Rating", "CASE WHEN p.rating IS NULL THEN 'sin dato' WHEN p.rating >= 4.5 THEN '4.5+' WHEN p.rating >= 4 THEN '4–4.4' WHEN p.rating >= 3.5 THEN '3.5–3.9' ELSE '<3.5' END"],
  ["Distancia", "CASE WHEN l.distance_km IS NULL THEN 'sin dato' WHEN l.distance_km < 5 THEN '<5 km' WHEN l.distance_km < 20 THEN '5–20 km' ELSE '20+ km' END"],
  ["Variante", "COALESCE(p.message_variant, 'sin dato')"],
];

export async function computeInsights(): Promise<Insights> {
  const tot = (await one<{ total: number; replied: number }>(
    `SELECT count(*) FILTER (WHERE ${CONTACTED})::int AS total, count(*) FILTER (WHERE ${REPLIED})::int AS replied FROM prospects p`,
  ))!;
  const parts = DIMS.map(
    ([dim, expr]) =>
      `SELECT '${dim}' AS dim, ${expr} AS value, count(*)::int AS contacted, count(*) FILTER (WHERE ${REPLIED})::int AS replied
       FROM prospects p LEFT JOIN localities l ON l.id = p.locality_id WHERE ${CONTACTED} GROUP BY 2`,
  );
  parts.push(
    `SELECT 'Problema' AS dim, t AS value, count(*)::int AS contacted, count(*) FILTER (WHERE ${REPLIED})::int AS replied
     FROM prospects p, unnest(p.pain_tags) t WHERE ${CONTACTED} GROUP BY 2`,
  );
  const rows = await q<{ dim: string; value: string; contacted: number; replied: number }>(parts.join("\nUNION ALL\n"));
  const segments = rows
    .map((r) => ({ ...r, rate: r.contacted ? r.replied / r.contacted : 0 }))
    .sort((a, b) => a.dim.localeCompare(b.dim) || b.rate - a.rate);
  return {
    total: tot.total,
    replied: tot.replied,
    rate: tot.total ? tot.replied / tot.total : 0,
    segments,
    enough: tot.total >= MIN_TOTAL,
  };
}

/** Búsqueda sugerida: en cada dimensión filtrable, el valor que responde claramente mejor que el promedio. */
export function suggestFilters(ins: Insights): { filters: Filters; reasons: string[] } {
  const f: Filters = {};
  const reasons: string[] = [];
  const best = (dim: string) =>
    ins.segments
      .filter((s) => s.dim === dim && s.contacted >= MIN_GROUP && s.value !== "sin dato" && s.rate >= ins.rate * 1.25)
      .sort((a, b) => b.rate - a.rate)[0];
  const pct = (r: number) => `${Math.round(r * 100)} %`;
  const cat = best("Categoría");
  if (cat) {
    f.cat = [cat.value];
    reasons.push(`Categoría ${cat.value}: ${pct(cat.rate)}`);
  }
  const type = best("Tipo");
  if (type) {
    f.chain = type.value === "cadena" ? "chain" : "independent";
    reasons.push(`${type.value}: ${pct(type.rate)}`);
  }
  const pains = ins.segments.filter(
    (s) => s.dim === "Problema" && s.contacted >= MIN_GROUP && s.rate >= ins.rate * 1.25,
  );
  if (pains.length) {
    f.pain = pains.slice(0, 3).map((p) => p.value);
    reasons.push(...pains.slice(0, 3).map((p) => `Problema ${p.value}: ${pct(p.rate)}`));
  }
  const web = best("Contacto");
  if (web?.value === "con web") {
    f.has = ["website"];
    reasons.push(`Con web: ${pct(web.rate)}`);
  }
  const score = best("Puntaje");
  if (score && score.value !== "<35") {
    f.minScore = score.value === "60+" ? 60 : 35;
    reasons.push(`Puntaje ${score.value}: ${pct(score.rate)}`);
  }
  f.notContacted = true;
  return { filters: f, reasons };
}

// --- Puntaje aprendido ---
export type Lift = { overall: number; byCategory: Map<string, number>; byType: Map<string, number>; byPain: Map<string, number> };

/** Tasas de respuesta por grupo (solo si hay datos suficientes). */
export async function loadLift(): Promise<Lift | null> {
  // Se cachea 5 min: el puntaje se recalcula seguido (al pegar reseñas, al completar datos).
  const ins = await cached("insights", 300, computeInsights);
  if (!ins.enough) return null;
  const map = (dim: string) =>
    new Map(ins.segments.filter((s) => s.dim === dim && s.contacted >= MIN_GROUP).map((s) => [s.value, s.rate]));
  return { overall: ins.rate, byCategory: map("Categoría"), byType: map("Tipo"), byPain: map("Problema") };
}

/** Bonus/penalización (±15) según cómo respondieron prospectos parecidos. */
export function learnedBonus(
  lift: Lift,
  p: { category: string | null; brand: string | null; pains: string[] },
): ScoreItem | null {
  const deltas: number[] = [];
  const c = lift.byCategory.get(p.category ?? "sin dato");
  if (c !== undefined) deltas.push(c - lift.overall);
  const t = lift.byType.get(p.brand ? "cadena" : "independiente");
  if (t !== undefined) deltas.push(t - lift.overall);
  const pr = p.pains.map((x) => lift.byPain.get(x)).filter((x): x is number => x !== undefined);
  if (pr.length) deltas.push(Math.max(...pr) - lift.overall);
  if (!deltas.length) return null;
  const pts = Math.max(-15, Math.min(15, Math.round((deltas.reduce((a, b) => a + b, 0) / deltas.length) * 100)));
  if (pts === 0) return null;
  return {
    points: pts,
    reason: pts > 0 ? "Perfil que respondió mejor que el promedio (datos reales)" : "Perfil que respondió peor que el promedio (datos reales)",
  };
}
