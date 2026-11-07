"use client";
import { useState } from "react";
import { useT } from "@/lib/i18n/client";
import { OBJECTIONS, replyPrompt } from "@/lib/extras";
import { CopyButton } from "@/app/copy-button";
import { addNoteAction } from "@/app/crm-actions";

/** Agente 10 · Asistente de respuestas: arma el prompt para tu app de Claude (sin API) y respuestas listas. */
export function ReplyAssistant(props: { id: number; name: string; ourMessage: string | null; report: string | null; caseLine: string | null }) {
  const t = useT();
  const [reply, setReply] = useState("");
  const prompt = replyPrompt({ name: props.name, theirReply: reply.trim() || "-", ourMessage: props.ourMessage, report: props.report, caseLine: props.caseLine });
  return (
    <div className="reply-assistant">
      <h2 style={{ marginTop: 18 }}>{t("Asistente de respuestas")}</h2>
      <form action={addNoteAction}>
        <input type="hidden" name="id" value={props.id} />
        <textarea
          name="body"
          rows={3}
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          placeholder={t("Pegá acá lo que te respondieron…")}
        />
        <div className="row" style={{ marginTop: 8 }}>
          <CopyButton text={prompt} label={t("Copiar prompt para Claude")} />
          <button className="btn secondary sm" disabled={!reply.trim()}>{t("Guardar como nota")}</button>
        </div>
      </form>
      <p className="help">{t("Pegá el prompt en tu app de Claude, revisá la respuesta y enviala vos por WhatsApp.")}</p>
      <div className="objections">
        {OBJECTIONS.map((o) => (
          <div key={o.key} className="objection">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong>{t(o.label)}</strong>
              <CopyButton text={o.reply} />
            </div>
            <div className="help">{o.reply}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
