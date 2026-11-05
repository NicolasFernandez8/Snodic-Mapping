import { cache } from "react";
import { cookies } from "next/headers";
import { isLang, isTheme, LANG_COOKIE, makeT, THEME_COOKIE, type Lang, type T, type Theme } from "./core";

export const getLang = cache(async (): Promise<Lang> => {
  const v = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(v) ? v : "es";
});

export const getTheme = cache(async (): Promise<Theme> => {
  const v = (await cookies()).get(THEME_COOKIE)?.value;
  return isTheme(v) ? v : "system";
});

/** Para server components: const t = await getT(); */
export const getT = cache(async (): Promise<T> => makeT(await getLang()));
