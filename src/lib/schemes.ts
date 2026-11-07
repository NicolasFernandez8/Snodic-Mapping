/**
 * Esquemas de solución: convierte cada IDEA del informe del Agente 4 en un esquema visual
 * (entrada → sistema de Snodic → pasos → resultado), como en "Qué hacemos" de la web de Snodic.
 * Lógica pura y sin IA: detecta canales y herramientas por palabras clave del propio informe.
 */
export type SchemeIcon =
  | "whatsapp" | "web" | "phone" | "mail" | "instagram" | "google" | "star" | "qr" | "user"
  | "bolt" | "chat" | "form" | "bell" | "check" | "clock" | "key" | "calendar" | "card" | "poll" | "bot" | "doc" | "chart" | "bed" | "smile" | "gear";

export type SchemeNode = { id: string; label: string; icon: SchemeIcon; sol: boolean; x: number; y: number };
export type Scheme = { title: string; problem: string; solution: string; impact: string; color: string; nodes: SchemeNode[]; edges: [string, string][] };
export type IdeaSections = { problem: string; solution: string; impact: string; clave: string; impl: string };

const SECTIONS = ["Problema", "Solución", "Impacto", "Clave", "Implementación", "Cómo venderlo", "Cómo medir resultados"];

/** Separa el informe en IDEAS y cada una en sus secciones. */
export function parseIdeas(report: string): IdeaSections[] {
  const blocks = report.split(/^\s*IDEA\s+\d+\s*:?\s*$/im).slice(1);
  const section = (b: string, name: string) => {
    const re = new RegExp(`${name}:\\s*\\n?([\\s\\S]*?)(?=\\n\\s*(?:${SECTIONS.join("|")}):|$)`, "i");
    return (re.exec(b)?.[1] ?? "").trim();
  };
  return blocks
    .map((b) => ({
      problem: section(b, "Problema"),
      solution: section(b, "Solución"),
      impact: section(b, "Impacto"),
      clave: section(b, "Clave"),
      impl: section(b, "Implementación"),
    }))
    .filter((i) => i.problem || i.solution);
}

type Rule = { re: RegExp; label: string; icon: SchemeIcon };

const CHANNELS: Rule[] = [
  { re: /whats ?app/i, label: "WhatsApp", icon: "whatsapp" },
  { re: /instagram/i, label: "Instagram", icon: "instagram" },
  { re: /\b(tel[eé]fono|llamad)/i, label: "Teléfono", icon: "phone" },
  { re: /\b(e-?mail|correo)/i, label: "Email", icon: "mail" },
  { re: /\b(web|p[aá]gina|online)\b/i, label: "Web", icon: "web" },
  { re: /google (business|maps)|ficha de google/i, label: "Google", icon: "google" },
  { re: /\bqr\b/i, label: "Código QR", icon: "qr" },
  { re: /rese[ñn]a/i, label: "Reseñas", icon: "star" },
];

const ACTIONS: Rule[] = [
  { re: /respuestas? r[aá]pidas?/i, label: "Respuestas rápidas", icon: "chat" },
  { re: /mensaje (autom[aá]tico|programado)|autom[aá]tic/i, label: "Mensaje automático", icon: "bolt" },
  { re: /chat ?bot|\bbot\b|asistente virtual/i, label: "Asistente automático", icon: "bot" },
  { re: /formulario|google forms|typeform/i, label: "Formulario", icon: "form" },
  { re: /check-?in (online|aut[oó]nomo|previo)|registro previo|pre-?check/i, label: "Check-in online", icon: "key" },
  { re: /checklist|lista de (control|tareas)/i, label: "Checklist", icon: "check" },
  { re: /recordatorio/i, label: "Recordatorio", icon: "clock" },
  { re: /\b(aviso|avisa|notific|alerta)/i, label: "Aviso al equipo", icon: "bell" },
  { re: /calendario|agenda|disponibilidad/i, label: "Disponibilidad", icon: "calendar" },
  { re: /\b(pago|cobro|se[ñn]al)\b/i, label: "Pago online", icon: "card" },
  { re: /encuesta|valoraci[oó]n|pedir (una )?rese[ñn]a/i, label: "Encuesta", icon: "poll" },
  { re: /plantilla/i, label: "Plantillas", icon: "doc" },
  { re: /panel|dashboard|reporte|registro de/i, label: "Panel de control", icon: "chart" },
  { re: /reserva directa|motor de reservas|link de reserva|enlace de reserva/i, label: "Reserva directa", icon: "calendar" },
  { re: /c[oó]digo de acceso|cerradura|llave/i, label: "Acceso con código", icon: "key" },
  { re: /limpieza|habitaci[oó]n lista/i, label: "Habitación lista", icon: "bed" },
];

function results(impact: string): Rule {
  const r: Rule[] = [
    { re: /rese[ñn]|nota|valoraci/i, label: "Mejores reseñas", icon: "star" },
    { re: /reserva/i, label: "Más reservas", icon: "calendar" },
    { re: /espera|tiempo|r[aá]pid/i, label: "Menos esperas", icon: "clock" },
    { re: /respuesta|contest|atend/i, label: "Respuesta al instante", icon: "chat" },
  ];
  return r.find((x) => x.re.test(impact)) ?? { re: /./, label: "Huésped satisfecho", icon: "smile" };
}

/** Coincidencias en orden de aparición, sin repetir etiqueta. */
function found(text: string, rules: Rule[]): Rule[] {
  return rules
    .map((r) => ({ r, at: text.search(r.re) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((x) => x.r)
    .filter((r, i, all) => all.findIndex((o) => o.label === r.label) === i);
}

const COLORS = ["#14a86b", "#2f7fe0", "#d98a00", "#c2337f"];
const shorten = (s: string, n = 46) => {
  const first = s.split(/[.\n]/)[0].trim();
  return first.length > n ? first.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : first;
};

export function buildScheme(idea: IdeaSections, index: number): Scheme {
  const how = `${idea.solution}\n${idea.impl}\n${idea.clave}`;
  const channel = found(how, CHANNELS)[0] ?? found(idea.problem, CHANNELS)[0] ?? { re: /./, label: "Huésped", icon: "user" as const };
  const acts = found(how, ACTIONS).filter((a) => a.label !== channel.label);
  const hub = acts[0] ?? { re: /./, label: "Automatización Snodic", icon: "gear" as const };
  const branches = acts.slice(1, 4);
  if (branches.length === 0) branches.push({ re: /./, label: "Aviso al equipo", icon: "bell" }, { re: /./, label: "Registro", icon: "doc" });
  const out = results(idea.impact);
  const ys = branches.length === 1 ? [50] : branches.length === 2 ? [26, 74] : [16, 50, 84];
  const nodes: SchemeNode[] = [
    { id: "in", label: channel.label, icon: channel.icon, sol: true, x: 11, y: 50 },
    { id: "hub", label: hub.label, icon: hub.icon, sol: true, x: 34, y: 50 },
    ...branches.map((b, i) => ({ id: `b${i}`, label: b.label, icon: b.icon, sol: false, x: 61, y: ys[i] })),
    { id: "out", label: out.label, icon: out.icon, sol: true, x: 87, y: 50 },
  ];
  const edges: [string, string][] = [["in", "hub"], ...branches.map((_, i) => ["hub", `b${i}`] as [string, string]), ...branches.map((_, i) => [`b${i}`, "out"] as [string, string])];
  return {
    title: shorten(idea.solution || idea.problem),
    problem: idea.problem,
    solution: idea.solution,
    impact: idea.impact,
    color: COLORS[index % COLORS.length],
    nodes,
    edges,
  };
}

export function schemesFromReport(report: string | null | undefined): Scheme[] {
  return report ? parseIdeas(report).map(buildScheme) : [];
}

/** Curva entre dos nodos en el sistema de coordenadas del SVG (250 × 100). */
export function edgePath(a: SchemeNode, b: SchemeNode, vertical = false): string {
  if (vertical) {
    // Vertical (celular): viewBox 100 × 125; el "x" del esquema pasa a ser la altura.
    const y0 = a.x * 1.25, y1 = b.x * 1.25, m = (y0 + y1) / 2;
    return `M${a.y} ${y0} C${a.y} ${m} ${b.y} ${m} ${b.y} ${y1}`;
  }
  const x0 = a.x * 2.5, x1 = b.x * 2.5, m = (x0 + x1) / 2;
  return `M${x0} ${a.y} C${m} ${a.y} ${m} ${b.y} ${x1} ${b.y}`;
}

/** Todas las etiquetas posibles (para traducciones y tests). */
export const SCHEME_LABELS = [
  ...CHANNELS.map((r) => r.label), ...ACTIONS.map((r) => r.label),
  "Huésped", "Automatización Snodic", "Registro", "Mejores reseñas", "Más reservas", "Menos esperas", "Respuesta al instante", "Huésped satisfecho",
];
