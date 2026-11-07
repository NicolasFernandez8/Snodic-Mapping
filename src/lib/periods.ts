/**
 * Filtros de período de Métricas: Por día, Semanales, Mensuales y Anuales (+ "Todo" en los gráficos de totales).
 * - En gráficos de totales, el período es una ventana móvil (últimas 24 h, 7 días, 30 días, 12 meses).
 * - En la actividad, el período es el tamaño de cada barra/punto (días, semanas, meses o años).
 * Todo sale de listas fijas: nunca se mete texto del usuario en el SQL.
 */
export type Period = "all" | "day" | "week" | "month" | "year";
export const PERIODS: Period[] = ["all", "day", "week", "month", "year"];
export const PERIOD_LABEL: Record<Period, string> = {
  all: "Todo",
  day: "Por día",
  week: "Semanales",
  month: "Mensuales",
  year: "Anuales",
};

export function parsePeriod(v: string | string[] | undefined, fallback: Period = "all", allowAll = true): Period {
  const s = Array.isArray(v) ? v[0] : v;
  const p = PERIODS.find((x) => x === s);
  if (!p || (!allowAll && p === "all")) return fallback;
  return p;
}

const WINDOW: Record<Exclude<Period, "all">, string> = { day: "1 day", week: "7 days", month: "30 days", year: "365 days" };

/** Intervalo SQL de la ventana (o null = sin filtro). */
export function windowInterval(p: Period): string | null {
  return p === "all" ? null : WINDOW[p];
}

/** Serie de tiempo: unidad, cantidad de puntos y formato de etiqueta (to_char de PostgreSQL). */
export function bucket(p: Period): { unit: "day" | "week" | "month" | "year"; n: number; fmt: string } {
  switch (p) {
    case "day":
      return { unit: "day", n: 14, fmt: "DD/MM" };
    case "month":
      return { unit: "month", n: 12, fmt: "MM/YY" };
    case "year":
      return { unit: "year", n: 5, fmt: "YYYY" };
    default:
      return { unit: "week", n: 8, fmt: "DD/MM" };
  }
}
