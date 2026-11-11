/**
 * Coordina los 4 agentes. Cada trabajo de la cola se resuelve acá.
 * El "daily_pipeline" corre todo en orden: mapear → recopilar → Notion → mensaje → informe → Notion.
 */
import { getSetting, one, setSetting } from "../db";
import { classifyPhones, enrichOpenData, fillAreas, refreshSeason, sendDigest, watchOpenings } from "./agents-plus";
import { notify } from "../notify";
import { rescoreAll } from "../score-store";
import { dedupeAll } from "../quality";
import { getLlm } from "../ai/llm";
import { parseKmlSectors } from "../geo/kml-import";
import type { Job } from "../jobs";
import { importRegion, importSectors, mapNextLocalities, mapNextProspects, sourceFromSettings } from "./agent1-mapper";
import { collectData, syncOneToNotion, syncProspectsToNotion } from "./agent2-collector";
import { NotionClient } from "../notion";
import { pullFromNotion } from "./notion-pull";
import { fixNotionNumbers } from "./notion-fix";
import { advanceStatus, generateOutput, runWriterAgent, syncBodiesToNotion, writeBodyToNotion } from "./agent34-writer";
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
    case "write_prospect": {
      // IA local: mensaje y después informe de un prospecto (el informe necesita el mensaje listo).
      const id = Number(p.id);
      const llm = await getLlm();
      const m = await generateOutput(id, "message", llm);
      await advanceStatus(id);
      const r = await generateOutput(id, "report", llm);
      const status = await advanceStatus(id);
      log(`#${id}: mensaje ${m?.status}, informe ${r?.status} → ${status}`);
      // En el momento: ficha y cuerpo en Notion (si está activado), sin esperar al pipeline diario.
      let notionPage: string | null = null;
      const nc = (await getSetting<boolean>("notion_enabled", false)) ? NotionClient.fromConfig() : null;
      if (nc) {
        try {
          notionPage = await syncOneToNotion(id, nc);
          if (notionPage) await writeBodyToNotion(id, nc);
        } catch (e) {
          log(`Notion: ${(e as Error).message}`);
        }
      }
      return { message: m?.status, report: r?.status, status, notion: !!notionPage };
    }
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
      return runWriterAgent("message", await getLlm(), Number(p.limit ?? 30), log);
    case "generate_reports":
      return runWriterAgent("report", await getLlm(), Number(p.limit ?? 30), log);
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
      return { datos: await enrichOpenData(log, Number(p.limit ?? 60)), barrios: await fillAreas(log, Number(p.areas ?? 200)) };
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
  // Fase 2 (en paralelo): recopilar datos, datos abiertos + barrios (OpenStreetMap, 1 pedido/seg),
  // WhatsApp móvil/fijo y, si toca, aperturas (semanal) y temporada (mensual).
  const daysSince = async (key: string) => {
    const at = await getSetting<string | null>(key, null);
    return at ? (Date.now() - new Date(at).getTime()) / 86400000 : Infinity;
  };
  const [weekly, monthly] = [(await daysSince("watch_openings_at")) >= 7, (await daysSince("season_refreshed_at")) >= 30];
  await Promise.all([
    step("agente2_datos", () => collectData(500, log)),
    step("agente2_datos_abiertos", async () => ({ datos: await enrichOpenData(log, 40), barrios: await fillAreas(log, 120) })),
    step("agente6_whatsapp", () => classifyPhones(log)),
    weekly
      ? step("agente8_aperturas", async () => {
          const r = await watchOpenings(log);
          await setSetting("watch_openings_at", new Date().toISOString());
          return r;
        })
      : Promise.resolve(),
    monthly ? step("agente12_temporada", () => refreshSeason(log)) : Promise.resolve(),
  ]);
  // Fase 3: calidad antes de escribir o enviar: marcar duplicados y recalcular puntajes.
  await step("agente5_duplicados", async () => ({ duplicados: await dedupeAll(), puntajes: await rescoreAll() }));
  // Fase 4 (en paralelo): Notion (datos) mientras la IA escribe mensajes e informes (de mejor a peor puntaje).
  const notion = await getSetting<boolean>("notion_enabled", false);
  if (!notion) log("Notion desactivado en Ajustes: los datos quedan solo en la app");
  await Promise.all([
    notion
      ? step("agente2_notion", async () => ({ datos: await syncProspectsToNotion(500, log), numeros: await fixNotionNumbers(log) }))
      : Promise.resolve(),
    auto
      ? step("agentes3y4_ia", async () => {
          const llm = await getLlm();
          return { mensajes: await runWriterAgent("message", llm, 200, log), informes: await runWriterAgent("report", llm, 200, log) };
        })
      : Promise.resolve(),
  ]);
  // Fase 5: con los textos listos, el cuerpo de las páginas de Notion.
  if (notion && auto) await step("notion_cuerpo", () => syncBodiesToNotion(500, log));
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
