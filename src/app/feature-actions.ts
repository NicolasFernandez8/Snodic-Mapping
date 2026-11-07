"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { q, setSetting } from "@/lib/db";
import { createSchedule, deleteSchedule, setScheduleActive } from "@/lib/schedules";
import { saveBatch } from "@/lib/batch";
import { blockProspect, unblockProspect } from "@/lib/quality";
import { assign, isStage, setStage } from "@/lib/crm";
import { importProspectsCsv } from "@/lib/csv-import";
import type { OutputKind } from "@/lib/agents/agent34-writer";
import { deleteSearch, parseFilters, saveSearch } from "@/lib/filters";

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
  const back = String(f.get("back") ?? "/revision");
  redirect(back.startsWith("/revision") ? back : "/revision");
}

export async function saveSearchAction(f: FormData) {
  const me = await requireUser();
  const name = String(f.get("name") ?? "").trim();
  if (!name) throw new Error("Falta el nombre");
  await saveSearch(name, parseFilters(new URLSearchParams(String(f.get("query") ?? ""))), me.id);
  const back = String(f.get("back") ?? "/prospectos");
  redirect(back.startsWith("/") ? back : "/prospectos");
}

export async function deleteSearchAction(f: FormData) {
  await requireUser();
  await deleteSearch(Number(f.get("id")));
  const back = String(f.get("back") ?? "/prospectos");
  redirect(back.startsWith("/") ? back : "/prospectos");
}

// --- Calendario de mapeos ---
const TZ_OK = ["America/Argentina/Buenos_Aires", "Europe/Madrid"];

export async function createScheduleAction(f: FormData) {
  const me = await requireUser();
  const tz = String(f.get("tz"));
  try {
    await createSchedule(
      {
        name: String(f.get("name") ?? ""),
        kind: f.get("kind") === "weekly" ? "weekly" : "once",
        jobType: f.get("job_type") === "daily_pipeline" ? "daily_pipeline" : "map_localities",
        quota: Number(f.get("amount") ?? f.get("quota") ?? 3),
        unit: f.get("unit") === "prospects" ? "prospects" : "localities",
        date: String(f.get("date") ?? ""),
        time: String(f.get("time") ?? ""),
        weekdays: f.getAll("weekdays").map(Number),
        tz: TZ_OK.includes(tz) ? tz : "Europe/Madrid",
      },
      me.id,
    );
  } catch (e) {
    redirect(`/calendario?error=${encodeURIComponent((e as Error).message)}`);
  }
  revalidatePath("/calendario");
  redirect("/calendario");
}

export async function toggleScheduleAction(f: FormData) {
  await requireUser();
  await setScheduleActive(Number(f.get("id")), f.get("active") === "1");
  revalidatePath("/calendario");
}

export async function deleteScheduleAction(f: FormData) {
  await requireUser();
  await deleteSchedule(Number(f.get("id")));
  revalidatePath("/calendario");
}

export async function setCalendarTzAction(f: FormData) {
  await requireUser();
  const tz = String(f.get("tz"));
  if (TZ_OK.includes(tz)) await setSetting("calendar_tz", tz);
  revalidatePath("/calendario");
}
