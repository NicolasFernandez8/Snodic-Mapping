/**
 * Mapa de la arquitectura de la app: cada agente (rama) con sus procesos (hojas) y la página a la que lleva.
 * Lo usa /arquitectura. Los textos se traducen con t() en el cliente.
 */
export type ArchProcess = { label: string; href: string; desc: string };
export type ArchAgent = { key: string; n: string; label: string; hue: number; href: string; processes: ArchProcess[] };

export const ARCH_ROOT = { label: "Snodic Mapping", href: "/" };

export const ARCH: ArchAgent[] = [
  {
    key: "a1", n: "1", label: "Mapeo de zonas", hue: 330, href: "/agentes#agente-1",
    processes: [
      { label: "Importar región", href: "/ajustes#region", desc: "Divide la región en localidades con OpenStreetMap o un KML." },
      { label: "Mapear localidades", href: "/agentes#agente-1", desc: "Busca negocios del rubro, de la más cercana al centro hacia afuera." },
      { label: "Dividir en barrios", href: "/agentes#agente-1", desc: "Divide la ciudad en sus barrios oficiales para que cada prospecto tenga su zona exacta." },
      { label: "Mapa y filtros", href: "/mapa", desc: "Zonas por estado y prospectos en el mapa." },
      { label: "KML para My Maps", href: "/mapa", desc: "Exporta zonas y prospectos para Google My Maps." },
      { label: "Calendario de mapeos", href: "/calendario", desc: "Programa mapeos por día y hora." },
    ],
  },
  {
    key: "a2", n: "2", label: "Recopilación de datos", hue: 205, href: "/agentes#agente-2",
    processes: [
      { label: "Recopilar datos", href: "/agentes#agente-2", desc: "Teléfono, web, Google Maps y puntaje con datos abiertos." },
      { label: "Datos abiertos", href: "/agentes#agente-2", desc: "Wikidata y direcciones de OpenStreetMap." },
      { label: "Reseñas", href: "/prospectos", desc: "Reseñas pegadas a mano en la ficha." },
      { label: "Prospectos", href: "/prospectos", desc: "Lista con filtros, CSV y acciones masivas." },
    ],
  },
  {
    key: "a3", n: "3", label: "Mensajes de WhatsApp", hue: 145, href: "/agentes#agente-3",
    processes: [
      { label: "Prompts en lote", href: "/lote", desc: "Prompts para tu app de Claude y guardado de respuestas." },
      { label: "Revisión rápida", href: "/revision", desc: "Revisión humana antes de enviar." },
      { label: "Variantes A/B", href: "/ajustes#variantes", desc: "Distintos enfoques del primer mensaje." },
    ],
  },
  {
    key: "a4", n: "4", label: "Informes de 2 ideas", hue: 35, href: "/agentes#agente-4",
    processes: [
      { label: "Informe", href: "/lote", desc: "Exactamente 2 ideas a partir de las reseñas." },
      { label: "Mini-auditoría", href: "/prospectos", desc: "Página pública con las 2 oportunidades." },
      { label: "Resumen para la reunión", href: "/prospectos", desc: "Problemas, ideas, caso y preguntas." },
    ],
  },
  {
    key: "a5", n: "5", label: "Mantenimiento", hue: 265, href: "/agentes#agente-5",
    processes: [
      { label: "Recalcular puntajes", href: "/agentes#agente-5", desc: "Puntaje de 0 a 100 por prospecto." },
      { label: "Buscar duplicados", href: "/agentes#agente-5", desc: "Detecta el mismo negocio cargado dos veces." },
      { label: "Borrador de caso", href: "/casos", desc: "Al cerrar un cliente arma el caso de éxito." },
    ],
  },
  {
    key: "a6", n: "6", label: "Detector de WhatsApp", hue: 100, href: "/agentes#agente-6",
    processes: [{ label: "Móvil o fijo", href: "/prospectos?has=mobile", desc: "Prioriza los móviles (probable WhatsApp)." }],
  },
  {
    key: "a7", n: "7", label: "Priorizador diario", hue: 0, href: "/agentes#agente-7",
    processes: [{ label: "Hoy contactá", href: "/", desc: "Seguimientos, aperturas y mejores puntajes del día." }],
  },
  {
    key: "a8", n: "8", label: "Vigilante de aperturas", hue: 180, href: "/agentes#agente-8",
    processes: [{ label: "Vigilar aperturas", href: "/agentes#agente-8", desc: "Revisa zonas ya mapeadas y marca negocios nuevos." }],
  },
  {
    key: "a9", n: "9", label: "Canal alternativo", hue: 55, href: "/agentes#agente-9",
    processes: [{ label: "Email e Instagram", href: "/canal", desc: "Si no hay móvil, otro canal con línea de baja." }],
  },
  {
    key: "a10", n: "10", label: "Asistente de respuestas", hue: 290, href: "/agentes#agente-10",
    processes: [{ label: "Responder a prospectos", href: "/prospectos", desc: "Prompt para tu app de Claude y objeciones listas." }],
  },
  {
    key: "a11", n: "11", label: "Reactivador", hue: 20, href: "/agentes#agente-11",
    processes: [{ label: "Reactivar", href: "/seguimientos#reactivar", desc: "Nuevo intento con otro enfoque a los 75 días." }],
  },
  {
    key: "a12", n: "12", label: "Calendario de temporada", hue: 230, href: "/agentes#agente-12",
    processes: [
      { label: "Feriados y temporada", href: "/calendario", desc: "Feriados oficiales y fechas fuertes de Alicante." },
      { label: "Aviso de temporada", href: "/", desc: "Avisa cuándo conviene contactar." },
    ],
  },
  {
    key: "crm", n: "CRM", label: "Captación", hue: 310, href: "/pipeline",
    processes: [
      { label: "Pipeline", href: "/pipeline", desc: "Etapas del prospecto, con arrastrar y soltar." },
      { label: "Seguimientos", href: "/seguimientos", desc: "Seguimientos del día con WhatsApp." },
      { label: "Métricas", href: "/metricas", desc: "Qué funciona y conversión por etapa." },
      { label: "Casos de éxito", href: "/casos", desc: "Se sugieren solos en mensajes." },
    ],
  },
  {
    key: "notion", n: "N", label: "Notion", hue: -1, href: "/notion",
    processes: [
      { label: "Enviar a Notion", href: "/notion", desc: "Datos, mensaje e informe (desactivado)." },
      { label: "Traer de Notion", href: "/notion", desc: "Vincula y completa datos vacíos (desactivado)." },
    ],
  },
];

/** Recorrido del pipeline diario: qué agente le pasa trabajo a cuál (se dibuja como flujo animado). */
export const ARCH_FLOW: [string, string][] = [
  ["a1", "a2"], ["a2", "a6"], ["a6", "a5"], ["a5", "a3"], ["a3", "a4"], ["a4", "notion"], ["a4", "a7"], ["a7", "crm"], ["crm", "a11"], ["crm", "a10"],
];
