"use client";
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
  const [pending, start] = useTransition();
  if (!props.href)
    return (
      <span className="help" title="Cargá un teléfono válido en la ficha">
        Sin teléfono para WhatsApp
      </span>
    );
  return (
    <button
      type="button"
      className="btn sm"
      style={{ background: "#25d366" }}
      disabled={pending}
      onClick={() => {
        if (props.alreadyBy && !confirm(`Ya lo contactó ${props.alreadyBy}. ¿Abrir WhatsApp igual?`)) return;
        window.open(props.href!, "_blank", "noopener");
        start(() => markSentAction(props.prospectId, props.kind));
      }}
    >
      {pending ? "Registrando…" : (props.label ?? "Enviar por WhatsApp")}
    </button>
  );
}
