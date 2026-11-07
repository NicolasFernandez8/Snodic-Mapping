/**
 * Lógica pura (sin red) de los agentes 6–12 y mejoras: tipo de teléfono, mejor horario, respuestas,
 * reactivación, canales alternativos, preguntas para la reunión y temporada.
 * Todo lo que va a prospectos queda en español de España.
 */

// ---------- Agente 6 · Detector de WhatsApp ----------
export type PhoneType = "mobile" | "landline" | "unknown";

/** España: 6xx/7xx = móvil (probable WhatsApp); 8xx/9xx = fijo. */
export function phoneType(phone: string | null | undefined): PhoneType {
  if (!phone) return "unknown";
  const d = phone.split(/[;,/]/)[0].replace(/\D/g, "").replace(/^(00)?34/, "");
  if (/^[67]\d{8}$/.test(d)) return "mobile";
  if (/^[89]\d{8}$/.test(d)) return "landline";
  return "unknown";
}

/** De varios teléfonos separados por ; o , elige el móvil si hay. */
export function bestPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const parts = phone.split(/[;,/]/).map((p) => p.trim()).filter(Boolean);
  return parts.find((p) => phoneType(p) === "mobile") ?? parts[0] ?? null;
}

// ---------- Mejora Agente 2 · Mejor horario para escribir ----------
/** "12:30 a 16:00 y 20:00 a 23:00" → [[750, 960], [1200, 1380]] en minutos. */
export function parseRanges(hours: string | null | undefined): [number, number][] {
  if (!hours) return [];
  const out: [number, number][] = [];
  for (const m of hours.matchAll(/(\d{1,2}):(\d{2})\s*a\s*(\d{1,2}):(\d{2})/g))
    out.push([+m[1] * 60 + +m[2], +m[3] * 60 + +m[4]]);
  return out;
}

const fmt = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/**
 * Sugerencia de franja (hora de España). Evita check-in (14–17 h) y check-out (10–12 h) en alojamientos,
 * y si hay historial de respuestas, prioriza la hora en que más respondieron.
 */
export function bestContactTime(p: { business_hours: string | null; category: string | null }, replyHours: number[] = []): string {
  // Solo cuentan respuestas en horario razonable para escribir (8 a 21 h): nunca recomendar la madrugada.
  const usable = replyHours.filter((h) => h >= 8 && h <= 20);
  if (usable.length >= 5) {
    const counts = new Map<number, number>();
    for (const h of usable) counts.set(h, (counts.get(h) ?? 0) + 1);
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    return `Entre ${fmt(best * 60)} y ${fmt((best + 1) * 60)} (hora de España): es cuando más respondieron prospectos parecidos.`;
  }
  const lodging = /hotel|hostel|guest|apartment|motel|chalet|hostal/i.test(p.category ?? "");
  const ranges = parseRanges(p.business_hours);
  if (ranges.length && !lodging) {
    const [s, e] = ranges[0];
    const start = Math.min(e - 60, s + 30);
    return `Entre ${fmt(start)} y ${fmt(Math.min(e, start + 90))} (hora de España): abierto y fuera del pico.`;
  }
  return lodging
    ? "Entre 11:00 y 13:00 o entre 17:00 y 19:00 (hora de España): fuera de check-out (10–12 h) y de check-in (14–17 h)."
    : "Entre 10:30 y 12:30 (hora de España): la recepción suele estar más tranquila.";
}

// ---------- Agente 9 · Canal alternativo ----------
export const UNSUBSCRIBE_LINE = "Si preferís que no os vuelva a escribir, respondedme «baja» y no os contactaré más.";

export function emailLink(to: string | null | undefined, message: string): string | null {
  if (!to) return null;
  const subject = "Una idea para vuestras reservas";
  const body = `${message}\n\n${UNSUBSCRIBE_LINE}`;
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function instagramProfile(handle: string | null | undefined): string | null {
  if (!handle) return null;
  if (handle.startsWith("http")) return handle;
  return `https://www.instagram.com/${handle.replace(/^@/, "")}/`;
}

// ---------- Agente 10 · Asistente de respuestas ----------
export const OBJECTIONS: { key: string; label: string; reply: string }[] = [
  {
    key: "precio",
    label: "¿Cuánto cuesta?",
    reply:
      "¡Buena pregunta! La primera etapa es gratuita: analizamos vuestro caso y os enseño qué haríamos y qué resultado esperar. Si os encaja, os paso un presupuesto cerrado, sin sorpresas. ¿Os viene bien una llamada de 15 minutos esta semana?",
  },
  {
    key: "tiempo",
    label: "No tenemos tiempo",
    reply:
      "Lo entiendo perfectamente, justo por eso lo planteamos para que no os quite tiempo: lo montamos nosotros y vosotros solo validáis. Son 15 minutos para ver si tiene sentido. ¿Qué día os va mejor?",
  },
  {
    key: "proveedor",
    label: "Ya tenemos proveedor",
    reply:
      "¡Genial que ya lo tengáis cubierto! No se trata de cambiar nada de lo que funciona, sino de resolver un punto concreto que vi en las reseñas. Si queréis, os paso la idea por escrito y la valoráis sin compromiso.",
  },
  {
    key: "info",
    label: "Mandame más información",
    reply:
      "¡Claro! Os preparo un resumen breve con lo que vi en vuestras reseñas y las 2 ideas concretas. ¿A qué email os lo envío, o preferís que os lo pase por aquí?",
  },
  {
    key: "no",
    label: "No nos interesa",
    reply: "Entendido, gracias por responder. No os vuelvo a escribir. ¡Mucha suerte con la temporada!",
  },
];

export function replyPrompt(input: {
  name: string;
  theirReply: string;
  ourMessage: string | null;
  report: string | null;
  caseLine: string | null;
}): string {
  return `Sos parte del equipo comercial de Snodic. Un negocio (${input.name}) respondió a nuestro primer mensaje de WhatsApp.

NUESTRO MENSAJE:
${input.ourMessage ?? "-"}

SU RESPUESTA:
${input.theirReply}

CONTEXTO (informe de oportunidades):
${input.report ?? "-"}
${input.caseLine ? `\nCASO DE ÉXITO PARA MENCIONAR SI SUMA: ${input.caseLine}\n` : ""}
OBJETIVO: proponer una respuesta de WhatsApp que lleve a una llamada o reunión breve.

REGLAS:
- Español de España (vosotros), tono cercano y profesional, como una persona real.
- Máximo 3 oraciones. Nada de lenguaje técnico ni frases vagas.
- Si preguntan precio: la primera etapa es gratuita y luego hay presupuesto cerrado.
- Si dicen que no les interesa, agradecé y cerrá sin insistir.
- Terminá con una pregunta concreta (día u horario) salvo que no les interese.

Devolvé únicamente el mensaje final.`;
}

// ---------- Agente 11 · Reactivador ----------
export function reactivationMessage(pain: string | null): string {
  const hook: Record<string, string> = {
    reservas: "cómo conseguir más reservas directas sin depender tanto de las plataformas",
    teléfono: "cómo no perder reservas cuando nadie puede atender el teléfono",
    respuesta: "cómo responder rápido a los huéspedes sin cargar más al equipo",
    espera: "cómo reducir las esperas que aparecen en algunas reseñas",
    "check-in": "cómo agilizar el check-in para que las primeras impresiones sumen en las reseñas",
    información: "cómo dar a los huéspedes la información clave antes de que pregunten",
    precio: "cómo evitar malentendidos con cargos y precios que acaban en reseñas negativas",
  };
  const topic = (pain && hook[pain]) || "cómo convertir lo que dicen vuestras reseñas en más reservas";
  return `Hola! Os escribí hace un tiempo y quizá no era buen momento.

Estos meses estuve trabajando justo en ${topic}, y me acordé de vosotros al volver a leer vuestras reseñas.

Si os viene bien, os lo cuento en 10 minutos, sin compromiso. ¿Con quién podría hablarlo?`;
}

// ---------- Mejora Agente 4 · Preguntas para la reunión ----------
const QUESTIONS: Record<string, string[]> = {
  reservas: ["¿Qué porcentaje de reservas os llega directo y cuánto por plataformas?", "¿Cuánto os cuestan las comisiones al mes?"],
  teléfono: ["¿Cuántas llamadas os entran al día y cuántas quedan sin atender?", "¿Quién atiende fuera del horario de recepción?"],
  respuesta: ["¿Por qué canales os escriben más los huéspedes?", "¿Cuánto tardáis de media en responder?"],
  espera: ["¿En qué momentos se forman más esperas?", "¿Cuántas personas hay en recepción en hora punta?"],
  "check-in": ["¿Cuánto dura un check-in típico?", "¿Usáis algún registro previo online?"],
  información: ["¿Qué es lo que más os preguntan los huéspedes?", "¿Cómo les enviáis la información antes de llegar?"],
  precio: ["¿Qué cargos generan más dudas?", "¿Cómo comunicáis la política de precios?"],
};

export function meetingQuestions(pains: string[]): string[] {
  const out = pains.flatMap((p) => QUESTIONS[p] ?? []);
  return [
    ...out,
    "¿Cuál es hoy vuestro mayor dolor de cabeza en el día a día?",
    "Si esto funciona, ¿qué resultado os haría decir que valió la pena?",
    "¿Quién más tiene que participar en la decisión?",
  ].slice(0, 8);
}

// ---------- Agente 12 · Calendario de temporada (Alicante) ----------
/** Fechas locales que la API de feriados no trae (aproximadas; se recalculan por año). */
export function localSeasonDates(year: number): { day: string; name: string; kind: "event" | "season" }[] {
  const d = (m: number, day: number) => `${year}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return [
    { day: d(3, 15), name: "Fallas (Valencia) · alta demanda regional", kind: "event" },
    { day: d(6, 20), name: "Hogueras de San Juan (Alicante)", kind: "event" },
    { day: d(7, 1), name: "Inicio de temporada alta de verano", kind: "season" },
    { day: d(8, 31), name: "Fin de temporada alta de verano", kind: "season" },
    { day: d(12, 20), name: "Temporada de Navidad", kind: "season" },
  ];
}

/** Próximo hito y si conviene contactar ya (entre 3 y 8 semanas antes). */
export function seasonAdvice(dates: { day: string; name: string }[], today = new Date()): { name: string; days: number; contactNow: boolean } | null {
  const t0 = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const next = dates
    .map((x) => ({ ...x, days: Math.round((Date.parse(x.day) - t0) / 86400000) }))
    .filter((x) => x.days >= 0)
    .sort((a, b) => a.days - b.days)[0];
  if (!next) return null;
  return { name: next.name, days: next.days, contactNow: next.days >= 21 && next.days <= 56 };
}
