"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { q } from "@/lib/db";
import { saveBatch } from "@/lib/batch";
import { blockProspect, unblockProspect } from "@/lib/quality";
import { assign, isStage, setStage } from "@/lib/crm";
import { importProspectsCsv } from "@/lib/csv-import";
import type { OutputKind } from "@/lib/agents/agent34-writer";

export async function saveBatchAction(f: FormData) {
  await requireUser();
  const kind: OutputKind = f.get("kind") === "report" ? "report" : "message";
  const ids = String(f.get("ids") ?? "")
    .split(",")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
  const { saved, missing } = await saveBatch(kind, ids, String(f.get("content") ?? ""));
  revalidatePath("/prospectos");
  redirect(`/lote?kind=${kind}&saved=${saved.length}${missing.length ? `&missing=${missing.join(",")}` : ""}`);
}

export async function blockAction(f: FormData) {
  const me = await requireUser();
  const id = Number(f.get("id"));
  await blockProspect(id, me.id, String(f.get("reason") ?? "").trim());
  revalidatePath(`/prospectos/${id}`);
  const next = String(f.get("next") ?? "");
  if (next.startsWith("/")) redirect(next);
}

export async function unblockAction(f: FormData) {
  const me = await requireUser("admin");
  const id = Number(f.get("id"));
  await unblockProspect(id, me.id);
  revalidatePath(`/prospectos/${id}`);
}

export async function bulkAction(f: FormData) {
  const me = await requireUser();
  const ids = f
    .getAll("ids")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
  const action = String(f.get("bulk") ?? "");
  if (!ids.length || !action) return;
  if (action === "discard") {
    await q("UPDATE prospects SET status = 'discarded', updated_at = now() WHERE id = ANY($1)", [ids]);
  } else if (action.startsWith("stage:")) {
    const stage = action.slice(6);
    if (!isStage(stage)) throw new Error("Etapa inválida");
    for (const id of ids) await setStage(id, stage, me.id);
  } else if (action.startsWith("assign:")) {
    const v = action.slice(7);
    for (const id of ids) await assign(id, v ? Number(v) : null, me.id);
  }
  revalidatePath("/prospectos");
  revalidatePath("/pipeline");
}

export async function importCsvAction(f: FormData) {
  const me = await requireUser();
  const file = f.get("csv");
  if (!(file instanceof File) || file.size === 0) throw new Error("Falta el archivo CSV");
  if (file.size > 5 * 1024 * 1024) throw new Error("El CSV supera 5 MB");
  const r = await importProspectsCsv(await file.text(), me.id);
  revalidatePath("/prospectos");
  redirect(`/prospectos?imported=${r.created}&skipped=${r.skipped}`);
}

export async function reviewDiscardAction(f: FormData) {
  const me = await requireUser();
  const id = Number(f.get("id"));
  await q("UPDATE prospects SET status = 'discarded', updated_at = now() WHERE id = $1", [id]);
  await setStage(id, "lost", me.id, "Descartado en revisión rápida");
  const skip = String(f.get("skip") ?? "").replace(/[^0-9,]/g, "");
  redirect(`/revision${skip ? `?skip=${skip}` : ""}`);
}
