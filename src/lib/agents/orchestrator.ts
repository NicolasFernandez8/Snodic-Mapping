/**
 * Coordina los 4 agentes. Cada trabajo de la cola se resuelve acá.
 * El "daily_pipeline" corre todo en orden: mapear → recopilar → Notion → mensaje → informe → Notion.
 */
import { getSetting, one } from "../db";
import { notify } from "../notify";
import { rescoreAll } from "../score-store";
import { dedupeAll } from "../quality";
import { llmFromConfig } from "../ai/llm";
import { parseKmlSectors } from "../geo/kml-import";
import type { Job } from "../jobs";
import { importRegion, importSectors, mapNextLocalities, mapNextProspects, sourceFromSettings } from "./agent1-mapper";
import { collectData, syncProspectsToNotion } from "./agent2-collector";
import { runWriterAgent, syncBodiesToNotion } from "./agent34-writer";
import type { AgentLog } from "./types";

export async function runJob(job: Pick<Job, "type" | "payload">, log: AgentLog): Promise<unknown> {
  const p = job.payload as Record<string, unknown>;
  switch (job.type) {
    case "import_region":
      if (typeof p.kml === "string") return importSectors(String(p.name), parseKmlSectors(p.kml));
      return importRegion(
        {
          name: String(p.name),
          adminLevel: p.adminLevel ? Number(p.adminLevel) : undefined,
          localityLevel: p.localityLevel ? Number(p.localityLevel) : undefined,
          relationId: p.relationId ? Number(p.relationId) : undefined,
        },
        log,
      );
    case "map_localities": {
      if (p.prospects) return mapNextProspects(Number(p.prospects), await sourceFromSettings(), log);
      const quota = Number(p.quota ?? (await getSetting<number>("daily_locality_quota", 3)));
      return mapNextLocalities(quota, await sourceFromSettings(), log);
    }
    case "collect_data":
      return collectData(Number(p.limit ?? 100), log);
    case "sync_notion":
      if (!(await getSetting<boolean>("notion_enabled", false))) {
        log("Sincronización con Notion desactivada en Ajustes: no se envió nada");
        return { skipped: true };
      }
      return { props: await syncProspectsToNotion(200, log), bodies: await syncBodiesToNotion(200, log) };
    case "generate_messages":
      return runWriterAgent("message", llmFromConfig(), Number(p.limit ?? 30), log);
    case "generate_reports":
      return runWriterAgent("report", llmFromConfig(), Number(p.limit ?? 30), log);
    case "daily_pipeline":
      return dailyPipeline(log, p.quota ? Number(p.quota) : undefined, p.prospects ? Number(p.prospects) : undefined);
    case "rescore":
      return { rescored: await rescoreAll() };
    case "dedupe":
      return { duplicates: await dedupeAll() };
    default:
      throw new Error(`Tipo de trabajo desconocido: ${job.type}`);
  }
}

export async function dailyPipeline(log: AgentLog, quotaOverride?: number, prospects?: number) {
  const steps: Record<string, unknown> = {};
  const step = async (name: string, fn: () => Promise<unknown>) => {
    try {
      steps[name] = await fn();
    } catch (e) {
      steps[name] = { error: (e as Error).message };
      log(`${name}: ${(e as Error).message}`);
    }
  };
  const quota = quotaOverride ?? (await getSetting<number>("daily_locality_quota", 3));
  const auto = await getSetting<boolean>("auto_generate_outputs", true);
  await step("agente1_mapeo", async () =>
    prospects ? mapNextProspects(prospects, await sourceFromSettings(), log) : mapNextLocalities(quota, await sourceFromSettings(), log),
  );
  await step("agente2_datos", () => collectData(500, log));
  const notion = await getSetting<boolean>("notion_enabled", false);
  if (notion) await step("agente2_notion", () => syncProspectsToNotion(500, log));
  else log("Notion desactivado en Ajustes: los datos quedan solo en la app");
  if (auto) {
    await step("agente3_mensajes", () => runWriterAgent("message", llmFromConfig(), 200, log));
    await step("agente4_informes", () => runWriterAgent("report", llmFromConfig(), 200, log));
    if (notion) await step("notion_cuerpo", () => syncBodiesToNotion(500, log));
  }
  await step("resumen_n8n", async () => {
    const s = await one<Record<string, number>>(`SELECT
      (SELECT count(*)::int FROM prospects WHERE created_at > now() - interval '24 hours') AS nuevos,
      (SELECT count(*)::int FROM prospects WHERE stage = 'contacted' AND next_follow_up_at <= now() + interval '12 hours') AS seguimientos,
      (SELECT count(*)::int FROM prospects WHERE stage = 'to_contact' AND status IN ('message_ready','report_ready','synced')) AS listos_para_contactar,
      (SELECT count(*)::int FROM activities WHERE kind = 'stage' AND to_stage = 'replied' AND created_at > now() - interval '24 hours') AS respuestas`);
    const mapped = steps.agente1_mapeo as { locality: string; created: number }[] | undefined;
    const sent = await notify("daily_summary", {
      ...s,
      localidades: Array.isArray(mapped) ? mapped.map((m) => `${m.locality} (+${m.created})`) : [],
    });
    return { sent, ...s };
  });
  return steps;
}
