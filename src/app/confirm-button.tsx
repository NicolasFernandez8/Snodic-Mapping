"use client";
import { useT } from "@/lib/i18n/client";

/** Botón de envío que pide confirmación antes de una acción que no se puede deshacer (borrar). */
export function ConfirmButton({ label, message, className = "btn danger sm" }: { label: string; message: string; className?: string }) {
  const t = useT();
  return (
    <button
      className={className}
      onClick={(e) => {
        if (!window.confirm(t(message))) e.preventDefault();
      }}
    >
      {t(label)}
    </button>
  );
}
