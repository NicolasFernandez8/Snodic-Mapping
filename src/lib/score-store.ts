import { one, q } from "./db";
import { scoreProspect } from "./scoring";

/** Recalcula y guarda el puntaje de un prospecto. */
export async function rescore(prospectId: number) {
  const p = await one<{
    phone: string | null;
    website: string | null;
    email: string | null;
    instagram: string | null;
    facebook: string | null;
    rating: string | null;
    reviews_count: number | null;
    category: string | null;
  }>("SELECT phone, website, email, instagram, facebook, rating, reviews_count, category FROM prospects WHERE id = $1", [
    prospectId,
  ]);
  if (!p) return null;
  const reviews = await q<{ rating: number | null; text: string }>("SELECT rating, text FROM reviews WHERE prospect_id = $1", [
    prospectId,
  ]);
  const { score, items } = scoreProspect({ ...p, rating: p.rating === null ? null : Number(p.rating), reviews });
  await q("UPDATE prospects SET score = $2, score_breakdown = $3::jsonb WHERE id = $1", [prospectId, score, JSON.stringify(items)]);
  return score;
}

export async function rescoreAll() {
  const ids = await q<{ id: number }>("SELECT id FROM prospects");
  for (const { id } of ids) await rescore(id);
  return ids.length;
}
