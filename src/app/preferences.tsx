"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LANG_COOKIE, THEME_COOKIE, type Lang, type Theme } from "@/lib/i18n/core";
import { useLang, useT } from "@/lib/i18n/client";

const YEAR = 365 * 24 * 3600;

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=${YEAR}; samesite=lax`;
}

/** Selector de idioma (ES/EN) y tema (sistema/claro/oscuro). Se guarda en cookies por navegador. */
export function Preferences({ theme: initialTheme, compact = false }: { theme: Theme; compact?: boolean }) {
  const router = useRouter();
  const lang = useLang();
  const t = useT();
  const [theme, setTheme] = useState<Theme>(initialTheme);

  const changeLang = (l: Lang) => {
    setCookie(LANG_COOKIE, l);
    router.refresh();
  };
  const changeTheme = (th: Theme) => {
    setCookie(THEME_COOKIE, th);
    setTheme(th);
    if (th === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", th);
  };

  return (
    <div className={`prefs ${compact ? "compact" : ""}`}>
      <div className="seg" role="group" aria-label={t("Idioma")}>
        {(["es", "en"] as Lang[]).map((l) => (
          <button key={l} type="button" className={lang === l ? "on" : ""} aria-pressed={lang === l} onClick={() => changeLang(l)}>
            {l.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="seg" role="group" aria-label={t("Tema")}>
        {(
          [
            ["system", "Auto", t("Tema del sistema")],
            ["light", "☀", t("Tema claro")],
            ["dark", "☾", t("Tema oscuro")],
          ] as [Theme, string, string][]
        ).map(([k, icon, label]) => (
          <button key={k} type="button" title={label} aria-label={label} className={theme === k ? "on" : ""} aria-pressed={theme === k} onClick={() => changeTheme(k)}>
            {icon}
          </button>
        ))}
      </div>
    </div>
  );
}
