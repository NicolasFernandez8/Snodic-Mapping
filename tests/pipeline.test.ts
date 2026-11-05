/**
 * Prueba de integración del pipeline completo contra PostgreSQL real.
 * Requiere TEST_DATABASE_URL (base descartable). Si no está, se omite.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("pipeline de agentes (integración)", () => {
  let mod: {
    db: typeof import("../src/lib/db");
    a1: typeof import("../src/lib/agents/agent1-mapper");
    a2: typeof import("../src/lib/agents/agent2-collector");
    a34: typeof import("../src/lib/agents/agent34-writer");
    notion: typeof import("../src/lib/notion");
    jobs: typeof import("../src/lib/jobs");
  };

  beforeAll(async () => {
    const c = new Client({ connectionString: url });
    await c.connect();
    await c.query("DROP SCHEMA IF EXISTS mapping CASCADE; DROP TABLE IF EXISTS public.schema_migrations;");
    await c.end();
    process.env.DATABASE_URL = url;
    const { migrate } = await import("../src/lib/migrate");
    await migrate(url!);
    mod = {
      db: await import("../src/lib/db"),
      a1: await import("../src/lib/agents/agent1-mapper"),
      a2: await import("../src/lib/agents/agent2-collector"),
      a34: await import("../src/lib/agents/agent34-writer"),
      notion: await import("../src/lib/notion"),
      jobs: await import("../src/lib/jobs"),
    };
  });

  afterAll(async () => {
    await mod?.db.pool().end();
  });

  it("mapea, recopila, genera y escribe en Notion", async () => {
    const { db, a1, a2, a34, notion, jobs } = mod;
    const sq = (x: number, y: number, s: number): [number, number][] => [
      [x, y],
      [x + s, y],
      [x + s, y + s],
      [x, y + s],
      [x, y],
    ];
    // Agente 1: dos sectores propios (como si vinieran de My Maps).
    const r = await a1.importSectors("Alicante (test)", [
      { name: "Lejos", area: { type: "Polygon", coordinates: [sq(-0.9, 38.0, 0.05)] } },
      { name: "Centro", area: { type: "Polygon", coordinates: [sq(-0.52, 38.33, 0.05)] } },
    ]);
    expect(r.localities).toBe(2);

    const fakeSource = {
      discover: async () => [
        { source: "google_places" as const, sourceId: "A", name: "Hotel Dentro", lat: 38.35, lng: -0.5, raw: {} },
        { source: "google_places" as const, sourceId: "B", name: "Hotel Fuera", lat: 40, lng: 2, raw: {} },
      ],
    };
    const res = await a1.mapNextLocalities(1, fakeSource);
    expect(res[0].locality).toBe("Centro"); // empieza por la más cercana al origen
    expect(res[0].created).toBe(1); // descarta el que cae fuera del polígono
    const again = await a1.mapNextLocalities(5, fakeSource);
    expect(again).toHaveLength(1); // solo quedaba "Lejos"
    expect(await a1.nextLocality()).toBeNull();
    const region = await db.one<{ status: string }>("SELECT status FROM regions WHERE id = $1", [r.regionId]);
    expect(region?.status).toBe("done");

    // Agente 2 sin Google: queda "enriched" con datos faltantes.
    const prospect = (await db.one<{ id: number }>("SELECT id FROM prospects WHERE source_id = 'A'"))!;
    await a2.collectData(10, () => {}, null);
    await db.q("INSERT INTO reviews (prospect_id, rating, text) VALUES ($1, 2, 'Nadie atiende el teléfono para reservar')", [
      prospect.id,
    ]);

    // Notion falso en memoria.
    const pages: Record<string, { properties: Record<string, unknown>; blocks: { id: string; b: unknown }[] }> = {};
    let seq = 0;
    const fakeFetch = (async (u: string, init: RequestInit) => {
      const path = u.replace("https://api.notion.com/v1", "");
      const body = init.body ? JSON.parse(init.body as string) : undefined;
      if (path.startsWith("/databases/"))
        return Response.json({
          properties: {
            Name: { type: "title" },
            Phone: { type: "phone_number" },
            Location: { type: "rich_text" },
            "Rating - Google Maps": { type: "number" },
            Ready: { type: "checkbox" },
            Type: { type: "select" },
            "Business Hours": { type: "rich_text" },
          },
        });
      if (path === "/pages" && init.method === "POST") {
        const id = `page${++seq}`;
        pages[id] = { properties: body.properties, blocks: [] };
        return Response.json({ id });
      }
      const m = /^\/blocks\/([^/]+)\/children$/.exec(path);
      if (m) {
        const ids = body.children.map((b: unknown) => {
          const id = `blk${++seq}`;
          pages[m[1]].blocks.push({ id, b });
          return { id };
        });
        return Response.json({ results: ids });
      }
      const del = /^\/blocks\/([^/]+)$/.exec(path);
      if (del && init.method === "DELETE") {
        for (const p of Object.values(pages)) p.blocks = p.blocks.filter((x) => x.id !== del[1]);
        return Response.json({});
      }
      return Response.json({});
    }) as unknown as typeof fetch;
    const nc = new notion.NotionClient("tok", "db", fakeFetch);
    const sync = await a2.syncProspectsToNotion(10, () => {}, nc);
    expect(sync.synced).toBe(1);
    expect(sync.missingProperties).toContain("Email");
    const page = Object.values(pages)[0];
    expect(page.properties["Phone"]).toEqual({ phone_number: null });
    expect(JSON.stringify(page.properties["Location"])).toContain("Centro");
    expect(page.properties["Rating - Google Maps"]).toEqual({ number: null }); // nombre truncado, se resuelve por prefijo
    expect(page.properties["Ready"]).toEqual({ checkbox: false });
    expect(page.properties["Type"]).toEqual({ select: { name: "Normal" } });
    expect(JSON.stringify(page.properties["Business Hours"])).toContain('"-"');

    // Agentes 3 y 4 con un LLM falso.
    const llm = {
      complete: async (prompt: string) => ({
        mode: "anthropic" as const,
        model: "fake",
        text: prompt.includes("EXACTAMENTE 2 ideas")
          ? ["IDEA 1", "IDEA 2"]
              .map((t) =>
                [t, "Problema:", "a", "Solución:", "b", "Impacto:", "c", "Clave:", "d", "Implementación:", "e", "Cómo venderlo:", "f", "Cómo medir resultados:", "g"].join("\n"),
              )
              .join("\n")
          : "Hola!\n\nEstuve viendo sus reseñas y destacan la limpieza. También vi que cuesta reservar por teléfono.\n\nMe llamo Nico y justamente me especializo en reservas por WhatsApp, para no perder reservas.\n\nEn una primera etapa sería totalmente gratuito para vosotros. La idea es analizar vuestro caso, ver si podemos aportar algo de valor.\n\nEstoy trabajando ahora con algunos alojamientos en esto para documentar resultados en este tipo de locales y me dijeron que me comunique con ustedes pero no me dijeron con quien. Con quien podría hablar del tema?",
      }),
    };
    // Un segundo prospecto sin reseñas debe quedar para revisión humana.
    await db.q(
      "INSERT INTO prospects (source, source_id, name, status, niche_key) VALUES ('manual','M1','Pensión Sin Reseñas','enriched','hospitality')",
    );
    const m = await a34.runWriterAgent("message", llm, 10);
    expect(m.processed).toBe(2);
    expect(m.ready).toBe(1); // el prospecto sin reseñas queda para revisión
    expect(m.needs_review).toBe(1);
    const rep = await a34.runWriterAgent("report", llm, 10);
    expect(rep.ready).toBe(1);

    const body = await a34.syncBodiesToNotion(10, () => {}, nc);
    expect(body.written).toBe(1);
    const texts = page.blocks.map((x) => JSON.stringify(x.b));
    expect(texts[0]).toContain("Hola!");
    const reportStart = texts.findIndex((t) => t.includes("IDEA 1"));
    expect(texts[reportStart - 1]).toContain('"rich_text":[]');
    expect(texts[reportStart - 2]).toContain('"rich_text":[]');
    const final = await db.one<{ status: string }>("SELECT status FROM prospects WHERE id = $1", [prospect.id]);
    expect(final?.status).toBe("synced");

    // Corrección humana: reemplaza los bloques sin duplicarlos.
    const before = page.blocks.length;
    await a34.saveManualOutput(prospect.id, "message", "Hola!\nTexto corregido");
    await a34.syncBodiesToNotion(10, () => {}, nc);
    expect(page.blocks.length).toBe(before - 9 + 2);
    expect(JSON.stringify(page.blocks[1].b)).toContain("Texto corregido");

    // Cola de trabajos.
    const job = await jobs.enqueue("collect_data", { limit: 1 });
    const picked = await jobs.pickJob();
    expect(picked?.id).toBe(job?.id);
    await jobs.failJob(picked!, new Error("boom"));
    const row = await db.one<{ status: string; last_error: string }>("SELECT status, last_error FROM jobs WHERE id = $1", [
      job!.id,
    ]);
    expect(row).toEqual({ status: "queued", last_error: "boom" });
  });
});
