import { bestPhone, phoneType } from "./extras";
/**
 * Puntaje de prioridad (0–100) para decidir a quién contactar primero.
 * Transparente: cada punto tiene un motivo visible en la ficha.
 */
export type ScoreInput = {
  phone: string | null;
  website: string | null;
  email: string | null;
  instagram: string | null;
  facebook: string | null;
  rating: number | null;
  reviews_count: number | null;
  category: string | null;
  reviews: { rating: number | null; text: string }[];
  is_new_opening?: boolean;
};

export type ScoreItem = { points: number; reason: string };

/** Problemas que se resuelven con soluciones simples (reservas, atención, respuestas…). */
export const PAIN_KEYWORDS: { tag: string; words: string[] }[] = [
  { tag: "reservas", words: ["reserv", "booking", "disponibilidad", "overbooking"] },
  { tag: "teléfono", words: ["teléfono", "telefono", "llamé", "llame", "no contestan", "nadie contest", "no responden", "no cogen"] },
  { tag: "respuesta", words: ["no respond", "sin respuesta", "email", "correo", "mensaje", "whatsapp"] },
  { tag: "espera", words: ["espera", "esperar", "tardó", "tardo", "tardaron", "cola", "lento", "demora"] },
  { tag: "check-in", words: ["check-in", "checkin", "check in", "recepción", "recepcion", "llaves", "llegada"] },
  { tag: "información", words: ["información", "informacion", "no sabían", "confus", "no avisaron", "instrucciones"] },
  { tag: "precio", words: ["cobraron", "cargo", "precio", "factura", "reembolso"] },
];

export function detectPains(reviews: { rating: number | null; text: string }[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of reviews) {
    if (r.rating !== null && r.rating >= 4) continue; // solo reseñas con quejas o sin puntaje
    const t = r.text.toLowerCase();
    for (const p of PAIN_KEYWORDS) if (p.words.some((w) => t.includes(w))) counts.set(p.tag, (counts.get(p.tag) ?? 0) + 1);
  }
  return [...counts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count);
}

export function scoreProspect(p: ScoreInput): { score: number; items: ScoreItem[] } {
  const items: ScoreItem[] = [];
  const add = (points: number, reason: string) => items.push({ points, reason });

  if (p.phone) {
    const t = phoneType(bestPhone(p.phone));
    if (t === "mobile") add(22, "Móvil: probable WhatsApp (contacto directo)");
    else if (t === "landline") add(8, "Solo teléfono fijo: probablemente sin WhatsApp");
    else add(12, "Tiene teléfono");
  }
  if (p.is_new_opening) add(10, "Nuevo en la zona: recién abierto, todavía sin proveedores");
  if (p.website) add(10, "Tiene web: invierte en presencia digital");
  if (p.instagram || p.facebook) add(5, "Activo en redes");
  if (p.email) add(5, "Tiene email");

  const pains = detectPains(p.reviews);
  if (pains.length) {
    const pts = Math.min(30, pains.reduce((s, x) => s + 10 * Math.min(x.count, 2), 0));
    add(pts, `Problemas detectados en reseñas: ${pains.map((x) => `${x.tag} (${x.count})`).join(", ")}`);
  }

  const rating = p.rating;
  if (rating !== null) {
    if (rating >= 3.5 && rating <= 4.5) add(15, `Rating ${rating}: bueno pero mejorable (le importa mejorar)`);
    else if (rating > 4.5) add(5, `Rating ${rating}: muy alto, menos urgencia`);
    else add(5, `Rating ${rating}: bajo, puede haber problemas de fondo`);
  }
  const n = p.reviews_count ?? 0;
  if (n >= 200) add(10, `${n} reseñas: volumen alto de huéspedes`);
  else if (n >= 50) add(7, `${n} reseñas: volumen medio`);
  else if (n > 0) add(3, `${n} reseñas`);

  if (p.category && /hotel|apartment|apartamento/i.test(p.category)) add(5, "Categoría con más volumen de reservas");

  const score = Math.max(0, Math.min(100, items.reduce((s, i) => s + i.points, 0)));
  return { score, items };
}
