/**
 * Ciclo de captación: etapas, historial, seguimientos, asignación y WhatsApp click-to-chat.
 * Nada se envía solo: la app prepara y registra; la persona envía.
 */
import { getSetting, one, q } from "./db";
import { notify } from "./notify";
import { bestPhone } from "./extras";

export const STAGES = [
  { key: "to_contact", label: "Por contactar" },
  { key: "contacted", label: "Contactado" },
  { key: "replied", label: "Respondió" },
  { key: "meeting", label: "Reunión" },
  { key: "client", label: "Cliente" },
  { key: "lost", label: "Descartado" },
] as const;
export type Stage = (typeof STAGES)[number]["key"];
export const STAGE_LABEL = Object.fromEntries(STAGES.map((s) => [s.key, s.label])) as Record<Stage, string>;
export const isStage = (s: string): s is Stage => STAGES.some((x) => x.key === s);

export type Activity = {
  id: number;
  kind: string;
  from_stage: string | null;
  to_stage: string | null;
  body: string | null;
  created_at: string;
  username: string | null;
};

export async function logActivity(
  prospectId: number,
  userId: number | null,
  kind: string,
  extra: { from?: string | null; to?: string | null; body?: string | null } = {},
) {
  await q(
    "INSERT INTO activities (prospect_id, user_id, kind, from_stage, to_stage, body) VALUES ($1,$2,$3,$4,$5,$6)",
    [prospectId, userId, kind, extra.from ?? null, extra.to ?? null, extra.body ?? null],
  );
}

export async function activities(prospectId: number): Promise<Activity[]> {
  return q<Activity>(
    `SELECT a.id, a.kind, a.from_stage, a.to_stage, a.body, a.created_at, u.username
     FROM activities a LEFT JOIN users u ON u.id = a.user_id WHERE a.prospect_id = $1 ORDER BY a.created_at DESC, a.id DESC`,
    [prospectId],
  );
}

/** Cambia la etapa, registra el historial y programa el seguimiento si corresponde. */
export async function setStage(prospectId: number, stage: Stage, userId: number | null, note?: string) {
  const cur = await one<{ stage: Stage; name: string }>("SELECT stage, name FROM prospects WHERE id = $1", [prospectId]);
  if (!cur) throw new Error("Prospecto inexistente");
  if (cur.stage === stage && !note) return;
  const days = await getSetting<number>("follow_up_days", 3);
  await q(
    `UPDATE prospects SET stage = $2::text, stage_changed_at = now(), updated_at = now(),
       contacted_at = CASE WHEN $2 = 'contacted' AND contacted_at IS NULL THEN now() ELSE contacted_at END,
       next_follow_up_at = CASE WHEN $2 = 'contacted' THEN COALESCE(next_follow_up_at, now() + ($3 || ' days')::interval)
                                ELSE NULL END,
       assigned_to = COALESCE(assigned_to, $4)
     WHERE id = $1`,
    [prospectId, stage, String(days), userId],
  );
  if (cur.stage !== stage) await logActivity(prospectId, userId, "stage", { from: cur.stage, to: stage, body: note });
  else if (note) await logActivity(prospectId, userId, "note", { body: note });
  if (stage === "client" && cur.stage !== "client")
    void import("./agents/agents-plus").then((m) => m.draftCaseStudy(prospectId)).catch(() => {});
  if (stage === "replied" || stage === "meeting" || stage === "client")
    void notify("stage_changed", { prospect: cur.name, from: STAGE_LABEL[cur.stage], to: STAGE_LABEL[stage] });
}

export async function addNote(prospectId: number, userId: number, body: string) {
  if (!body.trim()) return;
  await logActivity(prospectId, userId, "note", { body: body.trim().slice(0, 4000) });
}

export async function assign(prospectId: number, assignee: number | null, byUser: number) {
  const u = assignee ? await one<{ username: string }>("SELECT username FROM users WHERE id = $1", [assignee]) : null;
  await q("UPDATE prospects SET assigned_to = $2 WHERE id = $1", [prospectId, assignee]);
  await logActivity(prospectId, byUser, "assign", { body: u ? `Asignado a ${u.username}` : "Sin asignar" });
}

/** Registra un envío por WhatsApp (primer contacto o seguimiento). */
export async function markMessageSent(prospectId: number, userId: number, kind: "first" | "follow_up") {
  const p = await one<{ stage: Stage; follow_ups_sent: number }>(
    "SELECT stage, follow_ups_sent FROM prospects WHERE id = $1",
    [prospectId],
  );
  if (!p) throw new Error("Prospecto inexistente");
  if (kind === "first") {
    await logActivity(prospectId, userId, "message_sent", { body: "Primer mensaje enviado por WhatsApp" });
    if (p.stage === "to_contact") await setStage(prospectId, "contacted", userId);
    return;
  }
  const [days, max] = await Promise.all([getSetting<number>("follow_up_days", 3), getSetting<number>("follow_up_max", 2)]);
  const sent = p.follow_ups_sent + 1;
  await q(
    `UPDATE prospects SET follow_ups_sent = $2::int, updated_at = now(),
       next_follow_up_at = CASE WHEN $2::int < $3::int THEN now() + ($4 || ' days')::interval ELSE NULL END
     WHERE id = $1`,
    [prospectId, sent, max, String(days)],
  );
  await logActivity(prospectId, userId, "follow_up", { body: `Seguimiento ${sent} de ${max} enviado` });
}

export type FollowUpRow = {
  id: number;
  name: string;
  phone: string | null;
  locality: string | null;
  contacted_at: string | null;
  next_follow_up_at: string;
  follow_ups_sent: number;
  assigned: string | null;
  audit_slug: string | null;
};

export async function dueFollowUps(userId?: number): Promise<FollowUpRow[]> {
  return q<FollowUpRow>(
    `SELECT p.id, p.name, p.phone, l.name AS locality, p.contacted_at, p.next_follow_up_at, p.follow_ups_sent,
            u.username AS assigned, p.audit_slug
     FROM prospects p LEFT JOIN localities l ON l.id = p.locality_id LEFT JOIN users u ON u.id = p.assigned_to
     WHERE p.stage = 'contacted' AND p.next_follow_up_at IS NOT NULL AND p.next_follow_up_at <= now() + interval '12 hours'
       ${userId ? "AND (p.assigned_to = $1 OR p.assigned_to IS NULL)" : ""}
     ORDER BY p.next_follow_up_at`,
    userId ? [userId] : [],
  );
}

/** Mensaje de seguimiento (plantilla gratuita, español de España). */
export function followUpMessage(n: number, auditUrl?: string | null, caseLine?: string | null): string {
  const lines =
    n <= 1
      ? [
          "Hola! Os escribo de nuevo por si se os pasó el mensaje de la semana pasada.",
          caseLine ? `Hace poco ayudamos a ${caseLine}, y creo que en vuestro caso se podría hacer algo parecido.` : null,
          auditUrl
            ? `Os preparé un pequeño análisis gratuito de vuestras reseñas con 2 ideas concretas: ${auditUrl}`
            : "Si os viene bien, os preparo un pequeño análisis gratuito de vuestras reseñas con 2 ideas concretas.",
          "¿Con quién podría hablarlo?",
        ]
      : [
          "Hola! Último mensaje, no quiero molestar.",
          auditUrl ? `Os dejo el análisis por si os sirve más adelante: ${auditUrl}` : null,
          "Si en algún momento queréis verlo, estoy por aquí. ¡Un saludo!",
        ];
  return lines.filter(Boolean).join("\n\n");
}

/** Link oficial de WhatsApp (wa.me) con el mensaje precargado. Gratis, sin API. */
export function whatsappLink(phone: string | null | undefined, text: string): string | null {
  if (!phone) return null;
  let digits = (bestPhone(phone) ?? "").replace(/\D/g, "").replace(/^00/, "");
  if (digits.length === 9) digits = `34${digits}`;
  if (digits.length < 10) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
