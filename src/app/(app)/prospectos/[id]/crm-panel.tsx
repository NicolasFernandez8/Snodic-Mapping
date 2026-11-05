import { one, q } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { activities, STAGES, STAGE_LABEL, whatsappLink, type Stage } from "@/lib/crm";
import { listCases, matchCases } from "@/lib/cases";
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
  }>(
    `SELECT p.name, p.phone, p.stage, p.assigned_to, u.username AS assigned, p.contacted_at, p.next_follow_up_at,
            p.follow_ups_sent, p.score, p.score_breakdown, p.message_variant, p.audit_slug, p.audit_views, p.audit_last_viewed_at
     FROM prospects p LEFT JOIN users u ON u.id = p.assigned_to WHERE p.id = $1`,
    [id],
  ))!;
  const [users, history, message, report, reviews, cases, base] = await Promise.all([
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
  ]);
  const suggested = matchCases(cases, reviews, report?.content ?? "").slice(0, 2);
  const wa = message ? whatsappLink(p.phone, message.content) : null;
  const contactedBy = history.find((h) => h.kind === "message_sent")?.username ?? null;
  const auditUrl = p.audit_slug ? `${base}/a/${p.audit_slug}` : null;

  return (
    <div className="grid two" style={{ marginBottom: 16 }}>
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>Captación</h2>
          <span className="badge">{STAGE_LABEL[p.stage]}</span>
        </div>
        <div className="row" style={{ marginBottom: 12 }}>
          {message ? (
            <WhatsAppButton
              prospectId={id}
              href={wa}
              kind="first"
              alreadyBy={contactedBy && contactedBy !== me.username ? contactedBy : null}
              label={p.stage === "to_contact" ? "Enviar mensaje por WhatsApp" : "Abrir WhatsApp con el mensaje"}
            />
          ) : (
            <span className="help">Falta el mensaje del Agente 3 para habilitar WhatsApp.</span>
          )}
          {p.message_variant && <span className="badge muted">Variante {p.message_variant}</span>}
        </div>
        <form action={setStageAction} className="row" style={{ marginBottom: 10 }}>
          <input type="hidden" name="id" value={id} />
          <select name="stage" defaultValue={p.stage} style={{ width: "auto" }}>
            {STAGES.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
          <input name="note" placeholder="Nota (opcional)" style={{ flex: 1, minWidth: 140 }} />
          <button className="btn sm">Cambiar etapa</button>
        </form>
        <form action={assignAction} className="row" style={{ marginBottom: 10 }}>
          <input type="hidden" name="id" value={id} />
          <label htmlFor="assignee" style={{ margin: 0 }}>Responsable</label>
          <select id="assignee" name="assignee" defaultValue={p.assigned_to ?? ""} style={{ width: "auto" }}>
            <option value="">Sin asignar</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.username}</option>
            ))}
          </select>
          <button className="btn secondary sm">Asignar</button>
        </form>
        <dl className="dl">
          <dt>Contactado</dt><dd>{fmtDate(p.contacted_at)}</dd>
          <dt>Próximo seguimiento</dt><dd>{p.next_follow_up_at ? fmtDate(p.next_follow_up_at) : "-"} ({p.follow_ups_sent} enviados)</dd>
        </dl>

        <h2 style={{ marginTop: 18 }}>Mini-auditoría pública</h2>
        {auditUrl ? (
          <>
            <div className="row">
              <a href={auditUrl} target="_blank" rel="noreferrer">{auditUrl}</a>
              <CopyButton text={auditUrl} label="Copiar link" />
            </div>
            <p className="help">
              Vistas: {p.audit_views}
              {p.audit_last_viewed_at && ` · última ${fmtDate(p.audit_last_viewed_at)}`}
            </p>
            <form action={revokeAuditAction}>
              <input type="hidden" name="id" value={id} />
              <button className="btn danger sm">Despublicar</button>
            </form>
          </>
        ) : report ? (
          <form action={createAuditAction}>
            <input type="hidden" name="id" value={id} />
            <p className="help" style={{ marginTop: 0 }}>
              Página con las 2 oportunidades del Agente 4 y tu marca, para mandar en el seguimiento.
            </p>
            <button className="btn secondary sm">Publicar mini-auditoría</button>
          </form>
        ) : (
          <p className="help">Necesita el informe del Agente 4.</p>
        )}
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>Puntaje {p.score ?? "-"}/100</h2>
          <form action={rescoreAction}>
            <input type="hidden" name="id" value={id} />
            <button className="btn secondary sm">Recalcular</button>
          </form>
        </div>
        {p.score_breakdown.length ? (
          <ul style={{ margin: "0 0 12px", paddingLeft: 18 }}>
            {p.score_breakdown.map((s, i) => (
              <li key={i}><strong>+{s.points}</strong> {s.reason}</li>
            ))}
          </ul>
        ) : (
          <p className="help">Sin puntaje todavía.</p>
        )}
        {suggested.length > 0 && (
          <>
            <h2>Casos para mencionar</h2>
            {suggested.map((c) => (
              <p key={c.id} style={{ margin: "0 0 6px" }}>
                <strong>{c.title}</strong> — {c.result ?? c.summary}
              </p>
            ))}
          </>
        )}
        <h2 style={{ marginTop: 14 }}>Historial del equipo</h2>
        <form action={addNoteAction} className="row" style={{ marginBottom: 10 }}>
          <input type="hidden" name="id" value={id} />
          <input name="body" placeholder="Agregar nota interna…" style={{ flex: 1 }} required />
          <button className="btn sm">Anotar</button>
        </form>
        {history.length === 0 ? (
          <p className="help">Sin actividad.</p>
        ) : (
          <ul className="timeline">
            {history.map((h) => (
              <li key={h.id}>
                <div className="help">
                  {fmtDate(h.created_at)} · {h.username ?? "sistema"} · {KIND_LABEL[h.kind] ?? h.kind}
                </div>
                {h.kind === "stage" && (
                  <div>
                    {STAGE_LABEL[h.from_stage as Stage] ?? h.from_stage} → <strong>{STAGE_LABEL[h.to_stage as Stage] ?? h.to_stage}</strong>
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
