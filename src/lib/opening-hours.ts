/**
 * Convierte el horario de OpenStreetMap (etiqueta opening_hours) al formato de Notion de Snodic:
 *   "Mo-Su 12:30-16:00"  →  días "Lunes a Domingo", horas "12:30 a 16:00"
 * Cubre los formatos más comunes; si no se entiende, devuelve null (queda "-" para completar a mano).
 */
const DAYS: Record<string, string> = {
  Mo: "Lunes",
  Tu: "Martes",
  We: "Miércoles",
  Th: "Jueves",
  Fr: "Viernes",
  Sa: "Sábado",
  Su: "Domingo",
  PH: "Feriados",
};

export type BusinessSchedule = { days: string; hours: string };

function daysText(spec: string): string | null {
  const parts = spec.split(",").map((p) => p.trim());
  const out: string[] = [];
  for (const p of parts) {
    const range = /^(Mo|Tu|We|Th|Fr|Sa|Su)-(Mo|Tu|We|Th|Fr|Sa|Su)$/.exec(p);
    if (range) out.push(`${DAYS[range[1]]} a ${DAYS[range[2]]}`);
    else if (DAYS[p]) out.push(DAYS[p]);
    else return null;
  }
  return out.join(", ");
}

function hoursText(spec: string): string | null {
  const ranges = spec.split(",").map((r) => r.trim());
  const out: string[] = [];
  for (const r of ranges) {
    const m = /^(\d{1,2}:\d{2})-(\d{1,2}:\d{2}|24:00)\+?$/.exec(r);
    if (!m) return null;
    out.push(m[1] === "00:00" && (m[2] === "24:00" || m[2] === "00:00") ? "24 horas" : `${m[1]} a ${m[2]}`);
  }
  return out.join(" y ");
}

export function parseOpeningHours(raw: string | null | undefined): BusinessSchedule | null {
  if (!raw) return null;
  const v = raw.trim();
  if (v === "24/7") return { days: "Lunes a Domingo", hours: "24 horas" };
  const rules = v
    .split(";")
    .map((r) => r.trim())
    .filter(Boolean)
    .filter((r) => !/\boff\b|\bclosed\b/i.test(r));
  if (!rules.length) return null;
  const days: string[] = [];
  const hours: string[] = [];
  const detail: string[] = [];
  for (const rule of rules) {
    const m = /^([A-Za-z,\- ]+?)\s+([\d:,\-+ ]+)$/.exec(rule);
    // Sin días explícitos el horario aplica todos los días.
    const d = m ? daysText(m[1].replace(/\s+/g, "")) : "Lunes a Domingo";
    const h = hoursText((m ? m[2] : rule).replace(/\s+/g, ""));
    if (!d || !h) return null;
    days.push(d);
    detail.push(`${d}: ${h}`);
    if (!hours.includes(h)) hours.push(h);
  }
  // Si los horarios difieren según el día, se detalla cada tramo.
  return { days: days.join(", "), hours: hours.length === 1 ? hours[0] : detail.join(" · ") };
}
