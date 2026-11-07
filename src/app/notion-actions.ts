"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getSetting, setSetting } from "@/lib/db";
import { enqueue } from "@/lib/jobs";

export async function setNotionEnabledAction(f: FormData) {
  await requireUser("admin");
  await setSetting("notion_enabled", f.get("enabled") === "1");
  revalidatePath("/notion");
}

/** Encola un envío o una lectura. Con Notion apagado no encola nada. */
export async function notionJobAction(f: FormData) {
  await requireUser();
  if (!(await getSetting<boolean>("notion_enabled", false))) redirect("/notion?off=1");
  const kind = String(f.get("kind"));
  if (kind === "pull") await enqueue("notion_pull");
  else await enqueue("sync_notion", { part: kind === "props" || kind === "bodies" ? kind : "all" });
  revalidatePath("/notion");
  redirect("/notion");
}
