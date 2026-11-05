"use client";
import { useT } from "@/lib/i18n/client";
import { useTransition } from "react";
import { markSentAction } from "./crm-actions";

/**
 * Abre WhatsApp (wa.me) con el mensaje precargado y registra el envío.
 * La persona revisa y aprieta "Enviar" en WhatsApp: la app nunca envía sola.
 */
export function WhatsAppButton(props: {
  prospectId: number;
  href: string | null;
  kind: "first" | "follow_up";
  label?: string;
  alreadyBy?: string | null;
}) {
  const t = useT();
  const [pending, start] = useTransition();
  if (!props.href)
    return (
      <span className="help" title={t("Cargá un teléfono válido en la ficha")}>
        {t("Sin teléfono para WhatsApp")}
      </span>
    );
  return (
    <button
      type="button"
      className="btn sm"
      style={{ background: "#25d366" }}
      disabled={pending}
      onClick={() => {
        if (props.alreadyBy && !confirm(t("Ya lo contactó {name}. ¿Abrir WhatsApp igual?", { name: props.alreadyBy }))) return;
        window.open(props.href!, "_blank", "noopener");
        start(() => markSentAction(props.prospectId, props.kind));
      }}
    >
      {pending ? t("Registrando…") : (props.label ?? t("Enviar por WhatsApp"))}
    </button>
  );
}
