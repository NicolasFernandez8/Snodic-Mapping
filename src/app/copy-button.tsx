"use client";
import { useT } from "@/lib/i18n/client";
import { useState } from "react";

export function CopyButton({ text, label }: { text: string; label?: string }) {
  const t = useT();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn secondary sm"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? t("¡Copiado!") : (label ?? t("Copiar"))}
    </button>
  );
}
