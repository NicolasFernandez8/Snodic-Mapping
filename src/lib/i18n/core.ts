/**
 * Traducción simple: la clave es el texto en español; si no hay traducción al inglés, se muestra el español.
 * Interpolación: t("Página {n} de {total}", { n: 1, total: 3 }).
 * Los textos que van a prospectos (mensajes, informes, mini-auditoría) quedan siempre en español de España.
 */
import { EN } from "./en";

export type Lang = "es" | "en";
export const LANGS: Lang[] = ["es", "en"];
export const LANG_COOKIE = "snodic_lang";
export const THEME_COOKIE = "snodic_theme";
export type Theme = "system" | "light" | "dark";

export type T = (s: string, vars?: Record<string, string | number | null | undefined>) => string;

export function makeT(lang: Lang): T {
  return (s, vars) => {
    let out = lang === "en" ? (EN[s] ?? s) : s;
    if (vars) for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v ?? "-"));
    return out;
  };
}

export const isLang = (v: unknown): v is Lang => v === "es" || v === "en";
export const isTheme = (v: unknown): v is Theme => v === "system" || v === "light" || v === "dark";
