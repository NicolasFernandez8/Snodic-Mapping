"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { q } from "@/lib/db";
import { setSetting } from "@/lib/db";
import { addNote, assign, isStage, markMessageSent, setStage } from "@/lib/crm";
import { createAudit, revokeAudit } from "@/lib/audit";
import { rescore } from "@/lib/score-store";

const id = (f: FormData) => Number(f.get("id"));

function refresh(pid?: number) {
  if (pid) revalidatePath(`/prospectos/${pid}`);
  revalidatePath("/pipeline");
  revalidatePath("/seguimientos");
  revalidatePath("/prospectos");
}

export async function setStageAction(f: FormData) {
  const me = await requireUser();
  const stage = String(f.get("stage"));
  if (!isStage(stage)) throw new Error("Etapa inválida");
  await setStage(id(f), stage, me.id, String(f.get("note") ?? "").trim() || undefined);
  refresh(id(f));
}

/** Llamado desde el botón de WhatsApp (el navegador abre wa.me; acá solo se registra). */
export async function markSentAction(prospectId: number, kind: "first" | "follow_up") {
  const me = await requireUser();
  await markMessageSent(prospectId, me.id, kind);
  refresh(prospectId);
}

export async function addNoteAction(f: FormData) {
  const me = await requireUser();
  await addNote(id(f), me.id, String(f.get("body") ?? ""));
  refresh(id(f));
}

export async function assignAction(f: FormData) {
  const me = await requireUser();
  const v = String(f.get("assignee") ?? "");
  await assign(id(f), v ? Number(v) : null, me.id);
  refresh(id(f));
}

export async function createAuditAction(f: FormData) {
  const me = await requireUser();
  await createAudit(id(f), me.id);
  refresh(id(f));
}

export async function revokeAuditAction(f: FormData) {
  const me = await requireUser();
  await revokeAudit(id(f), me.id);
  refresh(id(f));
}

export async function rescoreAction(f: FormData) {
  await requireUser();
  await rescore(id(f));
  refresh(id(f));
}

// --- Casos de éxito ---
const tags = (v: FormDataEntryValue | null) =>
  String(v ?? "")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

export async function saveCaseAction(f: FormData) {
  await requireUser();
  const caseId = Number(f.get("case_id") || 0);
  const vals = [
    String(f.get("title") ?? "").trim(),
    tags(f.get("tags")),
    String(f.get("summary") ?? "").trim(),
    String(f.get("result") ?? "").trim() || null,
    String(f.get("link") ?? "").trim() || null,
  ];
  if (!vals[0] || !vals[2]) throw new Error("Faltan título y resumen");
  if (caseId)
    await q("UPDATE case_studies SET title=$2, tags=$3, summary=$4, result=$5, link=$6 WHERE id=$1", [caseId, ...vals]);
  else await q("INSERT INTO case_studies (title, tags, summary, result, link) VALUES ($1,$2,$3,$4,$5)", vals);
  revalidatePath("/casos");
}

export async function deleteCaseAction(f: FormData) {
  await requireUser("admin");
  await q("DELETE FROM case_studies WHERE id = $1", [Number(f.get("case_id"))]);
  revalidatePath("/casos");
}

// --- Variantes A/B y ajustes de captación ---
export async function saveVariantAction(f: FormData) {
  await requireUser("admin");
  const key = String(f.get("key") ?? "").trim().toUpperCase().slice(0, 8);
  if (!/^[A-Z0-9]+$/.test(key)) throw new Error("Clave inválida (letras/números)");
  await q(
    `INSERT INTO message_variants (key, label, instructions, active) VALUES ($1,$2,$3,$4)
     ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, instructions = EXCLUDED.instructions, active = EXCLUDED.active`,
    [key, String(f.get("label") ?? key).trim(), String(f.get("instructions") ?? "").trim(), f.get("active") === "on"],
  );
  revalidatePath("/ajustes");
}

export async function saveOutreachSettingsAction(f: FormData) {
  await requireUser("admin");
  await setSetting("follow_up_days", Math.max(1, Math.min(30, Number(f.get("follow_up_days") || 3))));
  await setSetting("follow_up_max", Math.max(0, Math.min(5, Number(f.get("follow_up_max") || 2))));
  await setSetting("contact_whatsapp", String(f.get("contact_whatsapp") ?? "").replace(/\D/g, ""));
  revalidatePath("/ajustes");
}
