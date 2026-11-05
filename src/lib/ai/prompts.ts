/**
 * Prompts de los agentes 3 (mensaje de WhatsApp) y 4 (informe de oportunidades).
 * Son los prompts originales de Snodic. Si se modifican, subir PROMPT_VERSION.
 */
export const PROMPT_VERSION = "2026-11-05.1";

export type ReviewInput = { rating?: number | null; text: string };

export type PromptInput = {
  name: string;
  reviewsUrl: string;
  businessLabel: string; // ej. "alojamientos"
  reviews: ReviewInput[];
  /** Indicación extra de la variante A/B del mensaje (vacía = original). */
  variantInstructions?: string;
};

function reviewsBlock(reviews: ReviewInput[]): string {
  if (!reviews.length) return "(No se pudieron obtener reseñas. No inventes datos.)";
  return reviews
    .map((r, i) => `Reseña ${i + 1}${r.rating ? ` (${r.rating}★)` : ""}: ${r.text.replace(/\s+/g, " ").trim()}`)
    .join("\n");
}

const REVIEWS_HEADER = (input: PromptInput) => `Necesito que analices las reseñas (positivas y negativas) de este local:

${input.name}

${input.reviewsUrl || "-"}

Reseñas obtenidas (fuente: Google Maps):
${reviewsBlock(input.reviews)}`;

export function messagePrompt(input: PromptInput): string {
  return `${REVIEWS_HEADER(input)}

---

🎯 OBJETIVO:
Generar un mensaje de WhatsApp corto, natural y personalizado basado en insights reales de las reseñas.

- Respetando los espacios entre puntos.

---

🧠 INSTRUCCIONES DE ANÁLISIS:

1. Identifica 1–2 aspectos positivos que se repitan frecuentemente en las reseñas (ej: ambiente, música, atención, producto).
2. Identifica 1 problema negativo que:
    - se repita
    - tenga impacto real en el negocio
    - podamos mejorar con una solución simple
3. A partir de ese problema:
    - define una solución concreta (en 1 línea, clara y sin tecnicismos)
    - define el beneficio directo para el negocio (en 1 línea, enfocado en resultado real: más reservas, más ventas, menos pérdida, etc.)

---

✍️ FORMATO DE RESPUESTA (OBLIGATORIO):

Generar EXACTAMENTE este mensaje (máximo 4 oraciones):

Hola!

Estuve viendo sus reseñas y [COSAS POSITIVAS]. También vi que [PROBLEMA DETECTADO].

Me llamo Nico y justamente me especializo en [SOLUCIÓN EN 1 LÍNEA], para [BENEFICIO EN 1 LÍNEA].

En una primera etapa sería totalmente gratuito para vosotros. La idea es analizar vuestro caso, ver si podemos aportar algo de valor.

Estoy trabajando ahora con algunos ${input.businessLabel} en esto para documentar resultados en este tipo de locales y me dijeron que me comunique con ustedes pero no me dijeron con quien. Con quien podría hablar del tema?

---

⚠️ REGLAS IMPORTANTES:

- Máximo 4 oraciones (no más)
- Lenguaje natural, como mensaje de WhatsApp
- Español de España (vosotros, podáis, etc.)
- NO mencionar el nombre del local en el mensaje
- La frase debe comenzar exactamente con: "Estuve viendo sus reseñas y..."
- No usar lenguaje técnico
- No sonar robótico ni genérico
- No inventar datos específicos si no son claros
- Evitar frases vagas como:
    - "mejorar la experiencia"
    - "optimizar procesos"
- Ser concreto, creíble y directo
- El mensaje debe sonar como si lo escribiera una persona real, no como un informe

---

🎯 TONO:

- Cercano pero profesional
- Seguro (no dudoso)
- Enfocado en negocio (ventas, clientes, reservas, etc.)

${input.variantInstructions ? `\n---\n\n🧪 INDICACIÓN ADICIONAL:\n\n${input.variantInstructions}\n` : ""}
Devolvé únicamente el mensaje final, sin comentarios ni explicaciones.`;
}

export function reportPrompt(input: PromptInput): string {
  return `${REVIEWS_HEADER(input)}

🎯 OBJETIVO:
Detectar oportunidades reales de mejora del negocio y generar EXACTAMENTE 2 ideas, cada una basada en un problema real detectado en las reseñas.
Las ideas deben estar pensadas para ser:

* vendibles
* simples
* con impacto directo en el negocio

🧠 INSTRUCCIONES DE ANÁLISIS:

1. Analiza las reseñas y detecta patrones:
   * problemas que se repiten
   * fricciones reales (espera, atención, confusión, reservas, etc.)
   * puntos donde se pierde dinero o eficiencia
2. Elegí EXACTAMENTE 2 problemáticas que:
   * se repitan
   * sean claras
   * tengan impacto real en el negocio
   * puedan resolverse con soluciones simples
3. Para cada problemática, generá una idea completa usando el framework de 7 pasos.

⚠️ REGLAS IMPORTANTES:

* EXACTAMENTE 2 ideas (ni más ni menos)
* 1 problema = 1 solución (no mezclar)
* No repetir ideas similares

❗ MUY IMPORTANTE:

* NO proponer sistemas grandes o integrales (ej: ERP, sistema completo de gestión, sistema total de inventario, sistema completo de mesas)
* Las soluciones deben ser ESPECÍFICAS al problema detectado
* Pueden ser:
   * flujos simples
   * automatizaciones concretas
   * herramientas puntuales
   * mejoras específicas
* Si se propone un sistema, debe ser:
   * pequeño
   * acotado
   * fácil de implementar
   * tipo POC

🚫 EVITAR:

* soluciones complejas o "todo en uno"
* ideas tipo:
   * "sistema completo de gestión del restaurante"
   * "plataforma integral"
* frases genéricas como:
   * "mejorar la experiencia"
   * "optimizar procesos"

📋 FORMATO DE RESPUESTA (OBLIGATORIO)
Para cada idea usar EXACTAMENTE esta estructura:
IDEA 1
Problema:
(Explicado en 1–2 frases, claro y basado en reseñas)
Solución:
(Qué haríamos, simple y concreto)
Impacto:
(Qué mejora en el negocio, directo a dinero o eficiencia)
Clave:
(Por qué es fácil de vender o implementar)
Implementación:
(Cómo se haría de forma simple, tipo POC)
Cómo venderlo:
(Frase corta, estilo WhatsApp o pitch directo)
Cómo medir resultados:
(1–2 métricas claras, antes vs después)
IDEA 2
(repetir exactamente la misma estructura)
🎯 CRITERIO DE CALIDAD:
Las ideas deben ser:

* fáciles de explicar en 10–15 segundos
* impacto claro en ingresos o eficiencia
* baja fricción (no cambiar operación)
* posibles de construir rápido (POC)

🧠 RECORDATORIO FINAL:
No estás proponiendo software complejo.
Estás proponiendo soluciones simples, específicas y accionables a problemas reales del negocio.

Devolvé únicamente las 2 ideas con el formato indicado, en texto plano (sin markdown).`;
}
