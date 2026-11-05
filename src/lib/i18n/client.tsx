"use client";
import { createContext, useContext, useMemo } from "react";
import { makeT, type Lang, type T } from "./core";

const Ctx = createContext<Lang>("es");

export function I18nProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <Ctx.Provider value={lang}>{children}</Ctx.Provider>;
}

export function useLang(): Lang {
  return useContext(Ctx);
}

/** Para client components: const t = useT(); */
export function useT(): T {
  const lang = useContext(Ctx);
  return useMemo(() => makeT(lang), [lang]);
}
