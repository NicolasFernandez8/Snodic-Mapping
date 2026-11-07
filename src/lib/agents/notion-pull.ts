/**
 * Traer de Notion (solo lectura en Notion): vincula páginas existentes con prospectos de la app
 * y completa datos de contacto VACÍOS en la app. Nunca pisa lo que ya tiene la app ni escribe en Notion.
 */
import { q } from "../db";
import { NotionClient, propertyMap, propText, resolveProperty, type NotionPage } from "../notion";
import type { AgentLog } from "./types";

const FIELDS = ["phone", "email", "website", "address", "business_days", "business_hours"] as const;
const key = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export async function pullFromNotion(log: AgentLog = () => {}, notion = NotionClient.fromConfig()) {
  if (!notion) {
    log("Notion no configurado (NOTION_TOKEN / NOTION_DATABASE_ID): no se trajo nada");
    return { pages: 0, linked: 0, filled: 0, skipped: true };
  }
  const schema = await notion.schema();
  const map = propertyMap();
  const prop = (f: string) => resolveProperty(schema, map[f] ?? f, f);
  const pages: NotionPage[] = await notion.queryPages();
  const prospects = await q<{ id: number; name: string; notion_page_id: string | null }>(
    "SELECT id, name, notion_page_id FROM prospects WHERE duplicate_of IS NULL",
  );
  const byPage = new Map(prospects.filter((p) => p.notion_page_id).map((p) => [p.notion_page_id!.replace(/-/g, ""), p]));
  const byName = new Map<string, typeof prospects>();
  for (const p of prospects.filter((x) => !x.notion_page_id)) byName.set(key(p.name), [...(byName.get(key(p.name)) ?? []), p]);
  let linked = 0, filled = 0;
  const titleProp = prop("name");
  for (const page of pages) {
    let p = byPage.get(page.id.replace(/-/g, ""));
    if (!p && titleProp) {
      const name = propText(page.properties[titleProp]);
      const cands = name ? byName.get(key(name)) : undefined;
      if (cands?.length === 1) {
        p = cands[0];
        await q("UPDATE prospects SET notion_page_id = $2 WHERE id = $1 AND notion_page_id IS NULL", [p.id, page.id]);
        byName.delete(key(name!));
        linked++;
      }
    }
    if (!p) continue;
    for (const f of FIELDS) {
      const pn = prop(f);
      const v = pn ? propText(page.properties[pn]) : null;
      if (!v) continue;
      const r = await q(`UPDATE prospects SET ${f} = $2, updated_at = now() WHERE id = $1 AND ${f} IS NULL RETURNING id`, [p.id, v]);
      filled += r.length;
    }
  }
  log(`Notion: ${pages.length} páginas leídas, ${linked} vinculadas por nombre, ${filled} datos completados en la app`);
  return { pages: pages.length, linked, filled };
}
