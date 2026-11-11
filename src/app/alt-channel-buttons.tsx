"use client";
import { useState, useTransition } from "react";
import { useT } from "@/lib/i18n/client";
import { markAltSentAction } from "./crm-actions";

/**
 * Agente 9 · Canal alternativo: abre el email (con el mensaje y la línea de baja) o copia el mensaje
 * y abre el perfil de Instagram. La persona revisa y envía; la app solo registra el contacto.
 */
export function AltChannelButtons(props: { prospectId: number; mailto: string | null; instagram: string | null; text: string }) {
  const t = useT();
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);
  return (
    <div className="row" style={{ gap: 8 }}>
      {props.mailto && (
        <button
          type="button"
          className="btn sm"
          disabled={pending}
          onClick={() => {
            window.location.href = props.mailto!;
            start(() => markAltSentAction(props.prospectId, "email"));
          }}
        >
          {t("✉ Enviar por email")}
        </button>
      )}
      {props.instagram && (
        <button
          type="button"
          className="btn secondary sm"
          disabled={pending}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(props.text);
              setCopied(true);
            } catch {}
            window.open(props.instagram!, "_blank", "noopener");
            start(() => markAltSentAction(props.prospectId, "Instagram"));
          }}
        >
          {copied ? t("¡Copiado! Pegalo en el chat") : t("Copiar y abrir Instagram ↗")}
        </button>
      )}
    </div>
  );
}
