/**
 * Numerar y corregir: da número correlativo ("Num") a las filas de la base que no lo tienen,
 * de la más vieja a la más nueva, siguiendo desde el número más alto.
 * Si la fila la creó la app (está vinculada a un prospecto), también completa lo que se arma al crear:
 * Category, Area, Type y Social Networks con las opciones de la base, y State "Pending Contact" si está vacío.
 * No borra filas ni toca las que ya tienen número.
 */
import { q } from "../db";
import { buildProperties, CREATE_ONLY, matchOption, NotionClient, propertyMap, resolveProperty } from "../notion";
import { notionFields } from "./agent2-collector";
import type { AgentLog } from "./types";

const plain = (id: string) => id.replace(/-/g, "");

export async function fixNotionNumbers(log: AgentLog = () => {}, notion = NotionClient.fromConfig()) {
  if (!notion) {
    log("Notion no configurado: no se numeró nada");
    return { numbered: 0, fixed: 0, skipped: true };
  }
  const prop = await notion.numberProperty();
  if (!prop) {
    log("La base no tiene una columna numérica \"Num\": no se numeró nada");
    return { numbered: 0, fixed: 0 };
  }
  const schema = await notion.schema();
  const options = await notion.options();
  const map = propertyMap();
  const createOnlyProps = new Set(
    Object.entries(map)
      .filter(([f]) => CREATE_ONLY.has(f))
      .map(([f, wanted]) => resolveProperty(schema, wanted, f))
      .filter((x): x is string => !!x),
  );
  const state = resolveProperty(schema, "State");
  const pending = state && schema[state] === "status" ? matchOption(options[state] ?? [], "Pending Contact") : null;

  const pages = await notion.pagesWithoutNumber(prop);
  const linked = new Map(
    (await q<{ id: number; notion_page_id: string; duplicate_of: number | null }>(
      "SELECT id, notion_page_id, duplicate_of FROM prospects WHERE notion_page_id IS NOT NULL",
    )).map((r) => [plain(r.notion_page_id), r]),
  );
  let numbered = 0, fixed = 0;
  const duplicates: string[] = [];
  for (const page of pages) {
    try {
      const num = await notion.takeNumber();
      if (!num) break;
      const props: Record<string, unknown> = { [num.prop]: { number: num.value } };
      const p = linked.get(plain(page.id));
      if (p) {
        const { properties } = buildProperties(await notionFields(p.id), schema, map, options, true);
        for (const [k, v] of Object.entries(properties)) if (createOnlyProps.has(k)) props[k] = v;
        const current = page.properties?.[state ?? ""] as { status?: { name?: string } | null } | undefined;
        if (state && pending && !current?.status?.name) props[state] = { status: { name: pending } };
        if (p.duplicate_of) duplicates.push(String(num.value));
        fixed++;
      }
      await notion.updatePage(page.id, props);
      numbered++;
    } catch (e) {
      log(`Página ${page.id}: ${(e as Error).message}`);
    }
  }
  log(`Numeradas ${numbered} filas sin Num${fixed ? ` (${fixed} creadas por la app, corregidas)` : ""}`);
  if (duplicates.length) log(`Posibles duplicados (revisar en Notion, Num): ${duplicates.join(", ")}`);
  const areas = await fixNotionAreas(log, notion);
  return { numbered, fixed, duplicates, areas };
}

/**
 * Barrio exacto en "Area" para las filas vinculadas con la app cuyo Area es genérico
 * (vacío, "Random" o el nombre de la ciudad/localidad). Nunca cambia un barrio que ya eligió una persona.
 */
export async function fixNotionAreas(log: AgentLog = () => {}, notion = NotionClient.fromConfig()) {
  if (!notion) return 0;
  const schema = await notion.schema();
  const options = await notion.options();
  const map = propertyMap();
  const areaProp = resolveProperty(schema, map.region ?? "Area", "region");
  if (!areaProp || schema[areaProp] !== "select") return 0;
  const rows = await q<{ id: number; notion_page_id: string; locality: string | null; region: string | null }>(
    `SELECT p.id, p.notion_page_id, l.name AS locality, r.name AS region FROM prospects p
     LEFT JOIN localities l ON l.id = p.locality_id LEFT JOIN regions r ON r.id = l.region_id
     WHERE p.notion_page_id IS NOT NULL AND COALESCE(p.area, '') <> ''`,
  );
  if (!rows.length) return 0;
  const byPage = new Map(rows.map((r) => [plain(r.notion_page_id), r]));
  let updated = 0;
  for (const page of await notion.queryPages()) {
    const r = byPage.get(plain(page.id));
    if (!r) continue;
    const current = ((page.properties?.[areaProp] as { select?: { name?: string } | null } | undefined)?.select?.name ?? "").trim();
    const generic = !current || /^random$/i.test(current) || current === r.region || current === r.locality;
    if (!generic) continue;
    const { properties } = buildProperties(await notionFields(r.id), schema, { region: map.region ?? "Area" }, options, true);
    const want = (properties[areaProp] as { select?: { name?: string } | null } | undefined)?.select?.name;
    if (!want || want === current) continue;
    try {
      await notion.updatePage(page.id, { [areaProp]: properties[areaProp] });
      updated++;
    } catch (e) {
      log(`Area ${page.id}: ${(e as Error).message}`);
    }
  }
  if (updated) log(`Area: ${updated} filas con el barrio exacto`);
  return updated;
}
