import { getT } from "@/lib/i18n/server";
import { one, q } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { activities, STAGES, STAGE_LABEL, whatsappLink, type Stage } from "@/lib/crm";
import { caseLine, listCases, matchCases } from "@/lib/cases";
import { bestContactTime, emailLink, instagramProfile, UNSUBSCRIBE_LINE } from "@/lib/extras";
import { ReplyAssistant } from "./reply-assistant";
import { hasAgentsPlus } from "@/lib/migration-status";
import type { ScoreItem } from "@/lib/scoring";
import {
  addNoteAction,
  assignAction,
  createAuditAction,
  rescoreAction,
  revokeAuditAction,
  setStageAction,
} from "@/app/crm-actions";
import { WhatsAppButton } from "@/app/whatsapp-button";
import { blockAction, unblockAction } from "@/app/feature-actions";
import Link from "next/link";
import { CopyButton } from "@/app/copy-button";
import { fmtDate } from "@/app/ui";
import { baseUrl } from "@/app/base-url";

const KIND_LABEL: Record<string, string> = {
  stage: "Etapa",
  note: "Nota",
  message_sent: "WhatsApp",
  follow_up: "Seguimiento",
  assign: "Asignación",
  audit_created: "Mini-auditoría",
  audit_view: "Vista",
};

export async function CrmPanel({ id }: { id: number }) {
  const t = await getT();
  const me = await requireUser();
  const p = (await one<{
    name: string;
    phone: string | null;
    stage: Stage;
    assigned_to: number | null;
    assigned: string | null;
    contacted_at: string | null;
    next_follow_up_at: string | null;
    follow_ups_sent: number;
    score: number | null;
    score_breakdown: ScoreItem[];
    message_variant: string | null;
    audit_slug: string | null;
    audit_views: number;
    audit_last_viewed_at: string | null;
    do_not_contact: boolean;
    duplicate_of: number | null;
    phone_type: "mobile" | "landline" | "unknown" | null;
    email: string | null;
    instagram: string | null;
    business_hours: string | null;
    category: string | null;
    is_new_opening: boolean;
  }>(
    `SELECT p.name, p.phone, p.stage, p.assigned_to, u.username AS assigned, p.contacted_at, p.next_follow_up_at,
            p.follow_ups_sent, p.score, p.score_breakdown, p.message_variant, p.audit_slug, p.audit_views, p.audit_last_viewed_at,
            p.do_not_contact, p.duplicate_of, ${await hasAgentsPlus() ? "p.phone_type, p.is_new_opening" : "NULL::text AS phone_type, false AS is_new_opening"},
            p.email, p.instagram, p.business_hours, p.category
     FROM prospects p LEFT JOIN users u ON u.id = p.assigned_to WHERE p.id = $1`,
    [id],
  ))!;
  const [users, history, message, report, reviews, cases, base, replyHours] = await Promise.all([
    q<{ id: number; username: string }>("SELECT id, username FROM users ORDER BY username"),
    activities(id),
    one<{ content: string }>(
      "SELECT content FROM outputs WHERE prospect_id = $1 AND kind = 'message' AND content IS NOT NULL ORDER BY created_at DESC, id DESC LIMIT 1",
      [id],
    ),
    one<{ content: string }>(
      "SELECT content FROM outputs WHERE prospect_id = $1 AND kind = 'report' AND content IS NOT NULL ORDER BY created_at DESC, id DESC LIMIT 1",
      [id],
    ),
    q<{ rating: number | null; text: string }>("SELECT rating, text FROM reviews WHERE prospect_id = $1", [id]),
    listCases(),
    baseUrl(),
    q<{ h: number }>(
      `SELECT extract(hour FROM created_at AT TIME ZONE 'Europe/Madrid')::int AS h FROM activities
       WHERE kind = 'stage' AND to_stage = 'replied' ORDER BY created_at DESC LIMIT 200`,
    ),
  ]);
  const suggested = matchCases(cases, reviews, report?.content ?? "").slice(0, 2);
  const wa = message && !p.do_not_contact ? whatsappLink(p.phone, message.content) : null;
  const contactedBy = history.find((h) => h.kind === "message_sent")?.username ?? null;
  const auditUrl = p.audit_slug ? `${base}/a/${p.audit_slug}` : null;
  const altText = message ? `${message.content}\n\n${UNSUBSCRIBE_LINE}` : null;
  const mail = message && !p.do_not_contact ? emailLink(p.email, message.content) : null;
  const ig = instagramProfile(p.instagram);
  const showAlt = !!message && !p.do_not_contact && p.phone_type !== "mobile" && (mail || ig);
  const bestTime = bestContactTime(p, replyHours.map((r) => r.h));
  const stageIdx = STAGES.findIndex((s) => s.key === p.stage);
  const testimonial = `¡Hola! Nos alegra mucho que estéis contentos con el trabajo. ¿Nos dejaríais una reseña breve o un par de frases sobre cómo os ayudó? Nos sirve muchísimo para que otros alojamientos nos conozcan. ¡Gracias!`;

  return (
    <div className="grid two" style={{ marginBottom: 16 }}>
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>{t("Captación")}</h2>
          <span className="badge">{t(STAGE_LABEL[p.stage])}</span>
        </div>
        {p.do_not_contact && (
          <div className="notice" style={{ borderColor: "var(--err)" }}>
            <strong>{t("No contactar")}</strong> · {t("Está en la lista de no contactar (RGPD). WhatsApp y seguimientos desactivados.")}
            {me.role === "admin" && (
              <form action={unblockAction} style={{ marginTop: 6 }}>
                <input type="hidden" name="id" value={id} />
                <button className="btn secondary sm">{t("Quitar de la lista")}</button>
              </form>
            )}
          </div>
        )}
        {p.duplicate_of && (
          <div className="notice">
            {t("Duplicado de")} <Link href={`/prospectos/${p.duplicate_of}`}>#{p.duplicate_of}</Link>
          </div>
        )}
        <div className="row" style={{ marginBottom: 12 }}>
          {message ? (
            <WhatsAppButton
              prospectId={id}
              href={wa}
              kind="first"
              alreadyBy={contactedBy && contactedBy !== me.username ? contactedBy : null}
              label={p.stage === "to_contact" ? t("Enviar mensaje por WhatsApp") : t("Abrir WhatsApp con el mensaje")}
            />
          ) : (
            <span className="help">{t("Falta el mensaje del Agente 3 para habilitar WhatsApp.")}</span>
          )}
          {p.message_variant && <span className="badge muted">{t("Variante")}{" "}{p.message_variant}</span>}
          {p.phone_type === "mobile" && <span className="badge ok phone-badge">{t("Móvil · probable WhatsApp")}</span>}
          {p.phone_type === "landline" && <span className="badge warn phone-badge">{t("Fijo · sin WhatsApp")}</span>}
          {p.is_new_opening && <span className="badge phone-badge">{t("Nuevo en la zona")}</span>}
        </div>
        {p.phone_type === "landline" && !p.do_not_contact && (
          <div className="notice">{t("El teléfono es fijo: WhatsApp probablemente no funcione. Probá por email o Instagram.")}</div>
        )}
        {showAlt && (
          <div className="row" style={{ marginBottom: 12 }}>
            <span className="help" style={{ margin: 0 }}>{t("Canal alternativo:")}</span>
            {mail && <a className="btn secondary sm" href={mail}>{t("✉ Enviar por email")}</a>}
            {ig && altText && (
              <>
                <CopyButton text={altText} label={t("Copiar para Instagram")} />
                <a className="btn secondary sm" href={ig} target="_blank" rel="noreferrer">{t("Abrir Instagram ↗")}</a>
              </>
            )}
          </div>
        )}
        {!p.do_not_contact && stageIdx <= 2 && (
          <p className="help" style={{ marginTop: 0 }}>🕒 {t("Mejor horario para escribir:")} {bestTime}</p>
        )}
        <form action={setStageAction} className="row" style={{ marginBottom: 10 }}>
          <input type="hidden" name="id" value={id} />
          <select name="stage" defaultValue={p.stage} style={{ width: "auto" }}>
            {STAGES.map((s) => (
              <option key={s.key} value={s.key}>{t(s.label)}</option>
            ))}
          </select>
          <input name="note" placeholder={t("Nota (opcional)")} style={{ flex: 1, minWidth: 140 }} />
          <button className="btn sm">{t("Cambiar etapa")}</button>
        </form>
        <form action={assignAction} className="row" style={{ marginBottom: 10 }}>
          <input type="hidden" name="id" value={id} />
          <label htmlFor="assignee" style={{ margin: 0 }}>{t("Responsable")}</label>
          <select id="assignee" name="assignee" defaultValue={p.assigned_to ?? ""} style={{ width: "auto" }}>
            <option value="">{t("Sin asignar")}</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.username}</option>
            ))}
          </select>
          <button className="btn secondary sm">{t("Asignar")}</button>
        </form>
        {(p.stage === "meeting" || p.stage === "replied") && (
          <p style={{ margin: "0 0 10px" }}>
            <Link className="btn secondary sm" href={`/prospectos/${id}/reunion`}>{t("📋 Resumen para la reunión")}</Link>
          </p>
        )}
        {p.stage === "client" && (
          <div className="notice">
            <strong>{t("Pedir testimonio")}</strong>
            <div className="help" style={{ margin: "4px 0 6px" }}>{testimonial}</div>
            <CopyButton text={testimonial} />{" "}
            <Link href="/casos">{t("Ver borrador del caso")}</Link>
          </div>
        )}
        {p.stage === "meeting" && (
          <form action={`/api/prospectos/${id}/ics`} method="get" className="row" style={{ marginBottom: 10 }}>
            <label style={{ margin: 0 }}>{t("Agendar reunión")}</label>
            <input type="date" name="date" required style={{ width: "auto" }} />
            <input type="time" name="time" defaultValue="10:00" required style={{ width: "auto" }} />
            <select name="minutes" defaultValue="30" style={{ width: "auto" }}>
              <option value="30">30 min</option>
              <option value="45">45 min</option>
              <option value="60">60 min</option>
            </select>
            <button className="btn secondary sm">{t("⬇ Calendario (.ics)")}</button>
          </form>
        )}
        <dl className="dl">
          <dt>{t("Contactado")}</dt><dd>{fmtDate(p.contacted_at)}</dd>
          <dt>{t("Próximo seguimiento")}</dt><dd>{p.next_follow_up_at ? fmtDate(p.next_follow_up_at) : "-"} {t("({n} enviados)", { n: p.follow_ups_sent })}</dd>
        </dl>

        {!p.do_not_contact && (
          <form action={blockAction} className="row" style={{ marginTop: 12 }}>
            <input type="hidden" name="id" value={id} />
            <input name="reason" placeholder={t("Motivo (opcional)")} style={{ flex: 1, minWidth: 140 }} />
            <button className="btn danger sm">{t("No contactar")}</button>
          </form>
        )}

        {(p.stage === "contacted" || p.stage === "replied") && (
          <ReplyAssistant
            id={id}
            name={p.name}
            ourMessage={message?.content ?? null}
            report={report?.content ?? null}
            caseLine={suggested[0] ? caseLine(suggested[0]) : null}
          />
        )}

        <h2 style={{ marginTop: 18 }}>{t("Mini-auditoría pública")}</h2>
        {auditUrl ? (
          <>
            <div className="row">
              <a href={auditUrl} target="_blank" rel="noreferrer">{auditUrl}</a>
              <CopyButton text={auditUrl} label={t("Copiar link")} />
            </div>
            <p className="help">
              {t("Vistas: {n}", { n: p.audit_views })}
              {p.audit_last_viewed_at && ` · ${t("última {d}", { d: fmtDate(p.audit_last_viewed_at) })}`}
            </p>
            <form action={revokeAuditAction}>
              <input type="hidden" name="id" value={id} />
              <button className="btn danger sm">{t("Despublicar")}</button>
            </form>
          </>
        ) : report ? (
          <form action={createAuditAction}>
            <input type="hidden" name="id" value={id} />
            <p className="help" style={{ marginTop: 0 }}>
              {t("Página con las 2 oportunidades del Agente 4 y tu marca, para mandar en el seguimiento.")}
            </p>
            <button className="btn secondary sm">{t("Publicar mini-auditoría")}</button>
          </form>
        ) : (
          <p className="help">{t("Necesita el informe del Agente 4.")}</p>
        )}
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>{t("Puntaje {n}/100", { n: p.score ?? "-" })}</h2>
          <form action={rescoreAction}>
            <input type="hidden" name="id" value={id} />
            <button className="btn secondary sm">{t("Recalcular")}</button>
          </form>
        </div>
        {p.score_breakdown.length ? (
          <ul style={{ margin: "0 0 12px", paddingLeft: 18 }}>
            {p.score_breakdown.map((s, i) => (
              <li key={i}><strong>+{s.points}</strong> {s.reason}</li>
            ))}
          </ul>
        ) : (
          <p className="help">{t("Sin puntaje todavía.")}</p>
        )}
        {suggested.length > 0 && (
          <>
            <h2>{t("Casos para mencionar")}</h2>
            {suggested.map((c) => (
              <p key={c.id} style={{ margin: "0 0 6px" }}>
                <strong>{c.title}</strong> — {c.result ?? c.summary}
              </p>
            ))}
          </>
        )}
        <h2 style={{ marginTop: 14 }}>{t("Historial del equipo")}</h2>
        <form action={addNoteAction} className="row" style={{ marginBottom: 10 }}>
          <input type="hidden" name="id" value={id} />
          <input name="body" placeholder={t("Agregar nota interna…")} style={{ flex: 1 }} required />
          <button className="btn sm">{t("Anotar")}</button>
        </form>
        {history.length === 0 ? (
          <p className="help">{t("Sin actividad.")}</p>
        ) : (
          <ul className="timeline">
            {history.map((h) => (
              <li key={h.id}>
                <div className="help">
                  {fmtDate(h.created_at)} · {h.username ?? t("sistema")} · {t(KIND_LABEL[h.kind] ?? h.kind)}
                </div>
                {h.kind === "stage" && (
                  <div>
                    {t(STAGE_LABEL[h.from_stage as Stage] ?? h.from_stage ?? "")} → <strong>{t(STAGE_LABEL[h.to_stage as Stage] ?? h.to_stage ?? "")}</strong>
                  </div>
                )}
                {h.body && <div>{h.body}</div>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
