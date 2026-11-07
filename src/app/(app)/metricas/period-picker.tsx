"use client";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";
import { useT } from "@/lib/i18n/client";
import { PERIOD_LABEL, type Period } from "@/lib/periods";

/** Selector de período de un gráfico (guarda la elección en la URL, así se puede compartir el link). */
export function PeriodPicker({ name, value, allowAll = true }: { name: string; value: Period; allowAll?: boolean }) {
  const t = useT();
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const opts = (Object.keys(PERIOD_LABEL) as Period[]).filter((p) => allowAll || p !== "all");
  return (
    <div className={`period ${pending ? "is-pending" : ""}`} role="group" aria-label={t("Período")}>
      {opts.map((p) => (
        <button
          key={p}
          type="button"
          aria-pressed={p === value}
          className={p === value ? "on" : ""}
          onClick={() => {
            const q = new URLSearchParams(sp.toString());
            q.set(name, p);
            start(() => router.replace(`${path}?${q.toString()}`, { scroll: false }));
          }}
        >
          {t(PERIOD_LABEL[p])}
        </button>
      ))}
    </div>
  );
}
