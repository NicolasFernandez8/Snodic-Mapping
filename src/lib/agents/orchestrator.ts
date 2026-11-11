/**
 * Coordina los 4 agentes. Cada trabajo de la cola se resuelve acá.
 * El "daily_pipeline" corre todo en orden: mapear → recopilar → Notion → mensaje → informe → Notion.
 */
import { getSetting, one, setSetting } from "../db";
import { classifyPhones, enrichOpenData, refreshSeason, sendDigest, watchOpenings } from "./agents-plus";
import { notify } from "../notify";
import { rescoreAll } from "../score-store";
import { dedupeAll } from "../quality";
import { llmFromConfig } from "../ai/llm";
import { parseKmlSectors } from "../geo/kml-import";
import type { Job } from "../jobs";
import { importRegion, importSectors, mapNextLocalities, mapNextProspects, sourceFromSettings } from "./agent1-mapper";
import { collectData, syncProspectsToNotion } from "./agent2-collector";
import { pullFromNotion } from "./notion-pull";
import { fixNotionNumbers } from "./notion-fix";
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
      if (p.part === "props") return { props: await syncProspectsToNotion(500, log), numbers: await fixNotionNumbers(log) };
      if (p.part === "bodies") return { bodies: await syncBodiesToNotion(500, log) };
      return { props: await syncProspectsToNotion(200, log), numbers: await fixNotionNumbers(log), bodies: await syncBodiesToNotion(200, log) };
    case "notion_fix":
      if (!(await getSetting<boolean>("notion_enabled", false))) {
        log("Notion desactivado: no se numeró nada");
        return { skipped: true };
      }
      return fixNotionNumbers(log);
    case "notion_pull":
      if (!(await getSetting<boolean>("notion_enabled", false))) {
        log("Notion desactivado en Ajustes: no se trajo nada");
        return { skipped: true };
      }
      return pullFromNotion(log);
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
    case "classify_phones":
      return classifyPhones(log);
    case "daily_digest":
      return sendDigest(log);
    case "watch_openings":
      return watchOpenings(log);
    case "enrich_open":
      return enrichOpenData(log, Number(p.limit ?? 60));
    case "season":
      return refreshSeason(log);
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
  await step("agente2_datos_abiertos", () => enrichOpenData(log, 40));
  // Mensual: vigilar aperturas y refrescar el calendario de temporada.
  const daysSince = async (key: string) => {
    const at = await getSetting<string | null>(key, null);
    return at ? (Date.now() - new Date(at).getTime()) / 86400000 : Infinity;
  };
  if ((await daysSince("watch_openings_at")) >= 7) {
    await step("agente8_aperturas", () => watchOpenings(log));
    await setSetting("watch_openings_at", new Date().toISOString());
  }
  if ((await daysSince("season_refreshed_at")) >= 30) await step("agente12_temporada", () => refreshSeason(log));
  const notion = await getSetting<boolean>("notion_enabled", false);
  if (notion) {
    await step("agente2_notion", () => syncProspectsToNotion(500, log));
    await step("notion_numerar", () => fixNotionNumbers(log));
  }
  else log("Notion desactivado en Ajustes: los datos quedan solo en la app");
  if (auto) {
    await step("agente3_mensajes", () => runWriterAgent("message", llmFromConfig(), 200, log));
    await step("agente4_informes", () => runWriterAgent("report", llmFromConfig(), 200, log));
    if (notion) await step("notion_cuerpo", () => syncBodiesToNotion(500, log));
  }
  await step("agente7_prioridades", () => sendDigest(log));
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
