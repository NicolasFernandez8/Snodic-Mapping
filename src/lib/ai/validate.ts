/**
 * Validaciones automáticas de las salidas de los agentes 3 y 4.
 * Si hay problemas, la salida queda como "needs_review" para revisión humana.
 */

const BANNED = ["mejorar la experiencia", "optimizar procesos", "plataforma integral", "erp"];

export function validateMessage(msg: string, localName: string): string[] {
  const issues: string[] = [];
  const text = msg.trim();
  if (!/^Hola!/.test(text)) issues.push('No empieza con "Hola!"');
  if (!text.includes("Estuve viendo sus reseñas y")) issues.push('Falta "Estuve viendo sus reseñas y..."');
  if (!text.includes("Me llamo Nico")) issues.push('Falta "Me llamo Nico"');
  if (!/gratuito/i.test(text)) issues.push("No aclara que la primera etapa es gratuita");
  if (!/Con qui[eé]n podr[ií]a hablar del tema\?/i.test(text)) issues.push("Falta la pregunta de cierre");
  const name = localName.trim().toLowerCase();
  if (name.length >= 4 && text.toLowerCase().includes(name)) issues.push("Menciona el nombre del local");
  for (const b of BANNED) if (text.toLowerCase().includes(b)) issues.push(`Usa frase prohibida: "${b}"`);
  if (/\[[A-ZÁÉÍÓÚ ]+\]/.test(text)) issues.push("Quedaron marcadores [ ] sin completar");
  return issues;
}

const REPORT_SECTIONS = [
  "Problema:",
  "Solución:",
  "Impacto:",
  "Clave:",
  "Implementación:",
  "Cómo venderlo:",
  "Cómo medir resultados:",
];

export function validateReport(report: string): string[] {
  const issues: string[] = [];
  const ideas = report.split(/^\s*IDEA\s+\d+\s*$/m).slice(1);
  if (ideas.length !== 2) issues.push(`Se esperaban EXACTAMENTE 2 ideas y hay ${ideas.length}`);
  ideas.forEach((idea, i) => {
    for (const s of REPORT_SECTIONS) if (!idea.includes(s)) issues.push(`IDEA ${i + 1}: falta "${s}"`);
  });
  const lower = report.toLowerCase();
  for (const b of BANNED) if (lower.includes(b)) issues.push(`Usa frase prohibida: "${b}"`);
  return issues;
}
