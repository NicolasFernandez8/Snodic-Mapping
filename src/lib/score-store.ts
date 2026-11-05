import { one, q } from "./db";
import { detectPains, scoreProspect } from "./scoring";
import { learnedBonus, loadLift, type Lift } from "./insights";

type Row = {
  id: number;
  phone: string | null;
  website: string | null;
  email: string | null;
  instagram: string | null;
  facebook: string | null;
  rating: string | null;
  reviews_count: number | null;
  category: string | null;
  brand: string | null;
  reviews: { rating: number | null; text: string }[] | null;
};

const SELECT = `SELECT p.id, p.phone, p.website, p.email, p.instagram, p.facebook, p.rating, p.reviews_count, p.category, p.brand,
  (SELECT json_agg(json_build_object('rating', r.rating, 'text', r.text)) FROM reviews r WHERE r.prospect_id = p.id) AS reviews
  FROM prospects p`;

const compute = (r: Row, lift: Lift | null) => {
  const reviews = r.reviews ?? [];
  const base = scoreProspect({ ...r, rating: r.rating === null ? null : Number(r.rating), reviews });
  const pains = detectPains(reviews).map((p) => p.tag);
  const bonus = lift ? learnedBonus(lift, { category: r.category, brand: r.brand, pains }) : null;
  const items = bonus ? [...base.items, bonus] : base.items;
  const score = Math.max(0, Math.min(100, items.reduce((s, i) => s + i.points, 0)));
  return { score, items, pains };
};

/** Recalcula y guarda el puntaje de un prospecto. */
export async function rescore(prospectId: number) {
  const r = await one<Row>(`${SELECT} WHERE p.id = $1`, [prospectId]);
  if (!r) return null;
  const { score, items, pains } = compute(r, await loadLift());
  await q("UPDATE prospects SET score = $2, score_breakdown = $3::jsonb, pain_tags = $4 WHERE id = $1", [
    prospectId,
    score,
    JSON.stringify(items),
    pains,
  ]);
  return score;
}

/** Recalcula todos en bloques de 500: 1 consulta para leer y 1 para escribir por bloque. */
export async function rescoreAll(batch = 500) {
  let last = 0;
  let total = 0;
  const lift = await loadLift();
  for (;;) {
    const rows = await q<Row>(`${SELECT} WHERE p.id > $1 ORDER BY p.id LIMIT $2`, [last, batch]);
    if (!rows.length) break;
    const scored = rows.map((r) => ({ id: r.id, ...compute(r, lift) }));
    await q(
      `UPDATE prospects p SET score = v.score, score_breakdown = v.items,
         pain_tags = COALESCE(ARRAY(SELECT jsonb_array_elements_text(v.pains)), '{}')
       FROM (SELECT unnest($1::int[]) AS id, unnest($2::int[]) AS score, unnest($3::jsonb[]) AS items, unnest($4::jsonb[]) AS pains) v
       WHERE p.id = v.id`,
      [
        scored.map((s) => s.id),
        scored.map((s) => s.score),
        scored.map((s) => JSON.stringify(s.items)),
        scored.map((s) => JSON.stringify(s.pains)),
      ],
    );
    total += rows.length;
    last = rows[rows.length - 1].id;
  }
  return total;
}
