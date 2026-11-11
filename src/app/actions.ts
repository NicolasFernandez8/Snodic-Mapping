"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { q, setSetting } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { enqueue, type JobType } from "@/lib/jobs";
import { aiMode, getLlm } from "@/lib/ai/llm";
import { saveManualReviews } from "@/lib/agents/agent2-collector";
import { advanceStatus, generateOutput, saveManualOutput, type OutputKind } from "@/lib/agents/agent34-writer";

const JOB_TYPES: JobType[] = [
  "import_region",
  "map_localities",
  "collect_data",
  "generate_messages",
  "generate_reports",
  "sync_notion",
  "notion_pull",
  "notion_fix",
  "write_prospect",
  "daily_pipeline",
  "rescore",
  "watch_openings",
  "daily_digest",
  "enrich_open",
  "season",
  "classify_phones",
  "dedupe",
];

export async function runAgent(formData: FormData) {
  await requireUser();
  const type = String(formData.get("type")) as JobType;
  if (!JOB_TYPES.includes(type)) throw new Error("Trabajo inválido");
  const payload: Record<string, unknown> = {};
  // Cantidad a mapear: localidades enteras (1–50) o prospectos (1–500).
  const amount = Number(formData.get("amount") ?? formData.get("quota"));
  if (Number.isFinite(amount) && amount > 0) {
    if (formData.get("unit") === "prospects") payload.prospects = Math.max(1, Math.min(500, Math.round(amount)));
    else payload.quota = Math.max(1, Math.min(50, Math.round(amount)));
  }
  await enqueue(type, payload);
  revalidatePath("/agentes");
  redirect("/agentes");
}

export async function importRegionAction(formData: FormData) {
  await requireUser("admin");
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
  await requireUser("admin");
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
  await requireUser("admin");
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
  await requireUser();
  const id = Number(formData.get("id"));
  const kind = String(formData.get("kind")) as OutputKind;
  await generateOutput(id, kind, await getLlm());
  await advanceStatus(id);
  revalidatePath(`/prospectos/${id}`);
}

export async function saveOutputAction(formData: FormData) {
  await requireUser();
  const id = Number(formData.get("id"));
  const kind = String(formData.get("kind")) as OutputKind;
  const content = String(formData.get("content") ?? "").trim();
  if (content) await saveManualOutput(id, kind, content);
  revalidatePath(`/prospectos/${id}`);
}

export async function updateProspectAction(formData: FormData) {
  await requireUser();
  const id = Number(formData.get("id"));
  const fields = ["phone", "email", "website", "instagram", "facebook", "business_days", "business_hours"] as const;
  const values = fields.map((f) => String(formData.get(f) ?? "").trim() || null);
  const ratingRaw = String(formData.get("rating") ?? "").trim().replace(",", ".");
  const rating = ratingRaw && !Number.isNaN(Number(ratingRaw)) ? Math.min(5, Math.max(0, Number(ratingRaw))) : null;
  await q(
    `UPDATE prospects SET phone = $2, email = $3, website = $4, instagram = $5, facebook = $6,
       business_days = $7, business_hours = $8, rating = $9, updated_at = now() WHERE id = $1`,
    [id, ...values, rating],
  );
  revalidatePath(`/prospectos/${id}`);
}

export async function discardProspectAction(formData: FormData) {
  await requireUser();
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
  await requireUser();
  await q("UPDATE localities SET status = 'pending', last_error = NULL WHERE id = $1", [Number(formData.get("id"))]);
  revalidatePath("/mapa");
  revalidatePath("/");
}

/** Si la IA local está activa, encola mensaje + informe del prospecto (se generan en segundo plano). */
async function autoWrite(id: number) {
  if ((await aiMode()) === "ollama") await enqueue("write_prospect", { id });
}

export async function saveReviewsAction(formData: FormData) {
  await requireUser();
  const id = Number(formData.get("id"));
  const text = String(formData.get("reviews") ?? "");
  const n = await saveManualReviews(id, text, formData.get("replace") === "on");
  if (n > 0) await autoWrite(id);
  revalidatePath(`/prospectos/${id}`);
}

/** Cola de reseñas: guarda y pasa al siguiente prospecto sin reseñas. */
export async function saveReviewsNextAction(formData: FormData) {
  await requireUser();
  const id = Number(formData.get("id"));
  const skip = String(formData.get("skip") ?? "");
  const n = await saveManualReviews(id, String(formData.get("reviews") ?? ""), false);
  if (n > 0) await autoWrite(id);
  revalidatePath("/resenas");
  redirect(`/resenas?ok=${id}${skip ? `&s=${skip}` : ""}`);
}

export async function setAiModeAction(formData: FormData) {
  await requireUser("admin");
  const mode = String(formData.get("mode"));
  await setSetting("ai_mode", mode === "ollama" ? "ollama" : "manual");
  const min = Number(formData.get("min_reviews_ai"));
  if (Number.isFinite(min) && min >= 1) await setSetting("min_reviews_ai", Math.min(20, Math.round(min)));
  revalidatePath("/ajustes");
  revalidatePath("/agentes");
}
