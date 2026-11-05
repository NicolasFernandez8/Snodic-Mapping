"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";

/**
 * Refresco en vivo liviano: consulta /api/status (unos bytes) y solo vuelve a renderizar la página
 * cuando los datos cambiaron. Cada 5 s si hay agentes trabajando, cada 30 s si no.
 */
export function AutoRefresh({ active: initial }: { active: boolean }) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(initial);
  const version = useRef<string | null>(null);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        if (document.visibilityState === "visible") {
          const s = (await (await fetch("/api/status", { cache: "no-store" })).json()) as { busy: boolean; version: string };
          if (version.current && s.version !== version.current) router.refresh();
          version.current = s.version;
          setBusy(s.busy);
          if (!stop) timer = setTimeout(tick, s.busy ? 5000 : 30000);
          return;
        }
      } catch {
        /* sin conexión: se reintenta */
      }
      if (!stop) timer = setTimeout(tick, 15000);
    };
    tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [router]);

  return busy ? (
    <span className="badge warn" style={{ alignSelf: "center" }}>{t("● Agentes trabajando · actualizando en vivo")}</span>
  ) : null;
}
