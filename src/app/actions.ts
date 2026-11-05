"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { q, setSetting } from "@/lib/db";
import { enqueue, type JobType } from "@/lib/jobs";
import { llmFromConfig } from "@/lib/ai/llm";
import { saveManualReviews } from "@/lib/agents/agent2-collector";
import { advanceStatus, generateOutput, saveManualOutput, type OutputKind } from "@/lib/agents/agent34-writer";

const JOB_TYPES: JobType[] = [
  "import_region",
  "map_localities",
  "collect_data",
  "generate_messages",
  "generate_reports",
  "sync_notion",
  "daily_pipeline",
];

export async function runAgent(formData: FormData) {
  const type = String(formData.get("type")) as JobType;
  if (!JOB_TYPES.includes(type)) throw new Error("Trabajo inválido");
  const payload: Record<string, unknown> = {};
  const quota = formData.get("quota");
  if (quota) payload.quota = Number(quota);
  await enqueue(type, payload);
  revalidatePath("/agentes");
  redirect("/agentes");
}

export async function importRegionAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Falta el nombre");
  const kmlFile = formData.get("kml");
  const payload: Record<string, unknown> = { name };
  if (kmlFile instanceof File && kmlFile.size > 0) {
    payload.kml = await kmlFile.text();
  } else {
    payload.adminLevel = Number(formData.get("adminLevel") || 6);
    payload.localityLevel = Number(formData.get("localityLevel") || 8);
    const rel = String(formData.get("relationId") ?? "").trim();
    if (rel) payload.relationId = Number(rel);
  }
  await enqueue("import_region", payload);
  redirect("/agentes");
}

export async function saveSettings(formData: FormData) {
  await setSetting("active_niche", String(formData.get("active_niche")));
  await setSetting("daily_locality_quota", Math.max(1, Math.min(50, Number(formData.get("daily_locality_quota") || 3))));
  await setSetting("prospect_source", String(formData.get("prospect_source")) === "google_places" ? "google_places" : "osm");
  await setSetting("auto_generate_outputs", formData.get("auto_generate_outputs") === "on");
  revalidatePath("/ajustes");
  revalidatePath("/");
}

const list = (v: FormDataEntryValue | null) =>
  String(v ?? "")
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);

export async function saveNiche(formData: FormData) {
  const label = String(formData.get("label") ?? "").trim();
  const key =
    String(formData.get("key") ?? "").trim() ||
    label
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
  if (!key || !label) throw new Error("Falta el nombre del rubro");
  const osmTags = list(formData.get("osm_tags"))
    .map((t) => t.split("="))
    .filter((p) => p.length === 2)
    .map(([k, v]) => ({ k: k.trim(), v: v.trim() }));
  await q(
    `INSERT INTO niches (key, label, google_types, keywords, osm_tags, business_label)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6)
     ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, google_types = EXCLUDED.google_types,
       keywords = EXCLUDED.keywords, osm_tags = EXCLUDED.osm_tags, business_label = EXCLUDED.business_label`,
    [
      key,
      label,
      list(formData.get("google_types")),
      list(formData.get("keywords")),
      JSON.stringify(osmTags),
      String(formData.get("business_label") || "negocios"),
    ],
  );
  revalidatePath("/ajustes");
}

export async function generateAction(formData: FormData) {
  const id = Number(formData.get("id"));
  const kind = String(formData.get("kind")) as OutputKind;
  await generateOutput(id, kind, llmFromConfig());
  await advanceStatus(id);
  revalidatePath(`/prospectos/${id}`);
}

export async function saveOutputAction(formData: FormData) {
  const id = Number(formData.get("id"));
  const kind = String(formData.get("kind")) as OutputKind;
  const content = String(formData.get("content") ?? "").trim();
  if (content) await saveManualOutput(id, kind, content);
  revalidatePath(`/prospectos/${id}`);
}

export async function updateProspectAction(formData: FormData) {
  const id = Number(formData.get("id"));
  const fields = ["phone", "email", "website", "instagram"] as const;
  const values = fields.map((f) => String(formData.get(f) ?? "").trim() || null);
  await q(
    `UPDATE prospects SET phone = $2, email = $3, website = $4, instagram = $5, updated_at = now() WHERE id = $1`,
    [id, ...values],
  );
  revalidatePath(`/prospectos/${id}`);
}

export async function discardProspectAction(formData: FormData) {
  const id = Number(formData.get("id"));
  const restore = formData.get("restore") === "1";
  if (restore) {
    await q("UPDATE prospects SET status = 'enriched', updated_at = now() WHERE id = $1", [id]);
    await advanceStatus(id);
  } else {
    await q("UPDATE prospects SET status = 'discarded', updated_at = now() WHERE id = $1", [id]);
  }
  revalidatePath(`/prospectos/${id}`);
}

export async function retryLocalityAction(formData: FormData) {
  await q("UPDATE localities SET status = 'pending', last_error = NULL WHERE id = $1", [Number(formData.get("id"))]);
  revalidatePath("/mapa");
  revalidatePath("/");
}

export async function saveReviewsAction(formData: FormData) {
  const id = Number(formData.get("id"));
  const text = String(formData.get("reviews") ?? "");
  await saveManualReviews(id, text, formData.get("replace") === "on");
  revalidatePath(`/prospectos/${id}`);
}
