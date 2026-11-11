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
    // Calidad antes que cantidad: un prospecto sin reseñas ni siquiera se manda a la IA.
    await db.q(
      "INSERT INTO prospects (source, source_id, name, status, niche_key) VALUES ('manual','M1','Pensión Sin Reseñas','enriched','hospitality')",
    );
    await db.setSetting("min_reviews_ai", 1);
    const m = await a34.runWriterAgent("message", llm, 10);
    expect(m.processed).toBe(1);
    expect(m.ready).toBe(1);
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

    // Usuarios: login, bloqueo por intentos y último admin.
    const users = await import("../src/lib/auth/users");
    await users.createUser("admin1", "clave-segura-1", "admin");
    await expect(users.createUser("ADMIN1", "clave-segura-1", "admin")).rejects.toThrow(/ya existe/);
    const token = await users.login("Admin1", "clave-segura-1", null);
    expect(token).toBeTruthy();
    expect((await users.userFromToken(token))?.username).toBe("admin1");
    expect(await users.userFromToken("token-falso")).toBeNull();
    await expect(users.deleteUser("admin1")).rejects.toThrow(/último administrador/);
    await expect(users.setRole("admin1", "member")).rejects.toThrow(/último administrador/);
    for (let i = 0; i < 5; i++) expect(await users.login("admin1", "mala", null)).toBeNull();
    await expect(users.login("admin1", "clave-segura-1", null)).rejects.toThrow(/Demasiados intentos/);
    await users.setPassword("admin1", "clave-nueva-2");
    expect(await users.userFromToken(token)).toBeNull(); // cambiar contraseña cierra sesiones
    await users.logout(token);

    // Captación: variante A/B, WhatsApp, seguimientos, etapas, auditoría.
    const crm = await import("../src/lib/crm");
    const admin = (await db.one<{ id: number }>("SELECT id FROM users WHERE username = 'admin1'"))!;
    const pv = await db.one<{ message_variant: string; score: number }>("SELECT message_variant, score FROM prospects WHERE id = $1", [prospect.id]);
    expect(["A", "B", "C"]).toContain(pv?.message_variant);
    await crm.markMessageSent(prospect.id, admin.id, "first");
    let st = await db.one<{ stage: string; next_follow_up_at: string | null; assigned_to: number }>(
      "SELECT stage, next_follow_up_at, assigned_to FROM prospects WHERE id = $1", [prospect.id]);
    expect(st?.stage).toBe("contacted");
    expect(st?.next_follow_up_at).not.toBeNull();
    expect(st?.assigned_to).toBe(admin.id);
    await db.q("UPDATE prospects SET next_follow_up_at = now() - interval '1 hour' WHERE id = $1", [prospect.id]);
    expect((await crm.dueFollowUps()).map((r) => r.id)).toContain(prospect.id);
    await crm.markMessageSent(prospect.id, admin.id, "follow_up");
    await crm.markMessageSent(prospect.id, admin.id, "follow_up");
    st = await db.one("SELECT stage, next_follow_up_at, assigned_to FROM prospects WHERE id = $1", [prospect.id]);
    expect(st?.next_follow_up_at).toBeNull(); // llegó al máximo (2)
    await crm.setStage(prospect.id, "replied", admin.id, "Pidió más info");
    const acts = await crm.activities(prospect.id);
    expect(acts[0]).toMatchObject({ kind: "stage", from_stage: "contacted", to_stage: "replied", body: "Pidió más info", username: "admin1" });
    expect(acts.filter((x) => x.kind === "follow_up")).toHaveLength(2);
    const audit = await import("../src/lib/audit");
    const slug = await audit.createAudit(prospect.id, admin.id);
    const a = await audit.auditBySlug(slug);
    expect(audit.parseReport(a!.report!)).toHaveLength(2);
    await audit.recordAuditView(prospect.id, "x");
    await audit.recordAuditView(prospect.id, "x"); // no cuenta dos veces seguidas
    expect((await db.one<{ audit_views: number }>("SELECT audit_views FROM prospects WHERE id = $1", [prospect.id]))?.audit_views).toBe(1);

    // No contactar, duplicados, CSV y lote.
    const quality = await import("../src/lib/quality");
    const csv = await import("../src/lib/csv-import");
    const batch = await import("../src/lib/batch");
    const imp = await csv.importProspectsCsv("Name,Phone,Location\nHotel Nuevo,611 22 33 44,Centro\nDemo Duplicado,611 22 33 44,Centro\n,,\n", admin.id);
    expect(imp).toEqual({ created: 1, skipped: 1 }); // duplicado por teléfono (las filas vacías se ignoran)
    const nuevo = (await db.one<{ id: number; locality_id: number | null }>("SELECT id, locality_id FROM prospects WHERE name = 'Hotel Nuevo'"))!;
    expect(nuevo.locality_id).not.toBeNull();
    await quality.blockProspect(nuevo.id, admin.id, "Pidió no ser contactado");
    expect(await quality.isBlocked({ name: "Otro nombre", phone: "+34 611223344" })).toBe(true);
    const reimport = await csv.importProspectsCsv("Name,Phone\nHotel Renombrado,611223344\n", admin.id);
    expect(reimport.created).toBe(0);
    await db.q("INSERT INTO prospects (source, source_id, name, lat, lng, phone) VALUES ('osm','node/9','Hotel Gemelo', 38.35, -0.5, NULL), ('osm','way/9','Gemelo', 38.3501, -0.5001, NULL)");
    expect(await quality.dedupeAll()).toBeGreaterThanOrEqual(1);
    const bp = await batch.buildBatchPrompt("message", [prospect.id]);
    expect(bp).toContain(`===RESPUESTA ${prospect.id}===`);
    const saved = await batch.saveBatch("message", [prospect.id, 99999], `===RESPUESTA ${prospect.id}===\nHola!\nPrueba lote\n===FIN ${prospect.id}===`);
    expect(saved).toEqual({ saved: [prospect.id], missing: [99999] });
    const { rescoreAll } = await import("../src/lib/score-store");
    expect(await rescoreAll(2)).toBeGreaterThan(2);

    // Mapear por cantidad de prospectos (localidad parcial y continuación).
    const reg = await a1.importSectors("Prospectos test", [
      { name: "Zona P", area: { type: "Polygon", coordinates: [sq(-0.40, 38.40, 0.05)] } },
      { name: "Zona Q", area: { type: "Polygon", coordinates: [sq(-0.30, 38.40, 0.05)] } },
    ]);
    await db.q("UPDATE regions SET status = CASE WHEN id = $1 THEN 'active' ELSE 'done' END", [reg.regionId]);
    const many = (prefix: string, x0: number, n: number) => Array.from({ length: n }, (_, k) => ({
      source: "osm" as const, sourceId: `${prefix}${k}`, name: `${prefix} Hotel número ${k} ${"x".repeat(k)}`,
      lat: 38.41 + k * 0.001, lng: x0 + k * 0.0012, phone: k % 2 ? `6${prefix === "P" ? 1 : 2}00000${String(k).padStart(2, "0")}` : undefined, raw: {},
    }));
    const src = { discover: async (l: { name: string }) => (l.name === "Zona P" ? many("P", -0.395, 10) : many("Q", -0.295, 4)) };
    const r1 = await a1.mapNextProspects(6, src);
    expect(r1).toEqual([expect.objectContaining({ locality: "Zona P", created: 6, partial: true })]);
    const savedP = await db.q<{ phone: string | null }>("SELECT phone FROM prospects WHERE source_id LIKE 'P%'");
    expect(savedP.filter((x) => x.phone).length).toBe(5); // primero los que tienen teléfono
    expect((await db.one<{ status: string }>("SELECT status FROM localities WHERE name = 'Zona P'"))?.status).toBe("partial");
    const r2 = await a1.mapNextProspects(6, src); // completa Zona P (4) y sigue con Zona Q (2)
    expect(r2.map((x) => [x.locality, x.created, !!x.partial])).toEqual([["Zona P", 4, false], ["Zona Q", 2, true]]);
    expect((await db.one<{ status: string }>("SELECT status FROM localities WHERE name = 'Zona P'"))?.status).toBe("mapped");

    // Mapeos programados.
    const sch = await import("../src/lib/schedules");
    const soon = new Date(Date.now() + 120000);
    const pad = (n: number) => String(n).padStart(2, "0");
    const loc = sch.zonedParts(soon, "Europe/Madrid");
    await sch.createSchedule(
      { name: "Test una vez", kind: "once", jobType: "map_localities", quota: 7, date: `${loc.y}-${pad(loc.m)}-${pad(loc.d)}`, time: `${pad(loc.h)}:${pad(loc.mi)}`, tz: "Europe/Madrid" },
      admin.id,
    );
    await sch.createSchedule(
      { name: "Test semanal", kind: "weekly", jobType: "daily_pipeline", quota: 2, time: "09:00", weekdays: [0, 1, 2, 3, 4, 5, 6], tz: "Europe/Madrid" },
      admin.id,
    );
    await expect(
      sch.createSchedule({ name: "Pasado", kind: "once", jobType: "map_localities", quota: 1, date: "2020-01-01", time: "09:00", tz: "Europe/Madrid" }, admin.id),
    ).rejects.toThrow(/ya pasaron/);
    expect(await sch.runDueSchedules(new Date())).toBe(0);
    expect(await sch.runDueSchedules(new Date(Date.now() + 3 * 60000))).toBe(1);
    const sj = await db.one<{ type: string; payload: { quota: number } }>("SELECT type, payload FROM jobs ORDER BY id DESC LIMIT 1");
    expect(sj).toMatchObject({ type: "map_localities", payload: { quota: 7 } });
    const once = await db.one<{ active: boolean; next_run_at: string | null }>("SELECT active, next_run_at FROM schedules WHERE name = 'Test una vez'");
    expect(once).toEqual({ active: false, next_run_at: null });
    await db.q("DELETE FROM jobs");

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
  it("agentes 6–12: WhatsApp, prioridades, reactivar y borrador de caso", async () => {
    const { db } = mod;
    const plus = await import("../src/lib/agents/agents-plus");
    const crm = await import("../src/lib/crm");
    const cases = await import("../src/lib/cases");
    const u = (await db.one<{ id: number }>("SELECT id FROM users ORDER BY id LIMIT 1"))!;
    const mk = async (sid: string, phone: string) =>
      (await db.one<{ id: number }>(
        "INSERT INTO prospects (source, source_id, name, phone, status, niche_key, score, pain_tags) VALUES ('manual',$1,$1,$2,'message_ready','hospitality',80,'{reservas}') RETURNING id",
        [sid, phone],
      ))!.id;
    const mob = await mk("Hotel Móvil", "+34 612 000 111");
    const fix = await mk("Hotel Fijo", "+34 965 000 222");
    await db.q("INSERT INTO outputs (prospect_id, kind, status, content, prompt) VALUES ($1,'message','ready','Hola','p'), ($2,'message','ready','Hola','p')", [mob, fix]);
    await plus.classifyPhones();
    const types = await db.q<{ id: number; phone_type: string }>("SELECT id, phone_type FROM prospects WHERE id = ANY($1)", [[mob, fix]]);
    expect(Object.fromEntries(types.map((t) => [t.id, t.phone_type]))).toEqual({ [mob]: "mobile", [fix]: "landline" });

    const digest = await plus.dailyDigest(10);
    const ids = digest.map((d) => d.id);
    expect(ids).toContain(mob);
    if (ids.includes(fix)) expect(ids.indexOf(mob)).toBeLessThan(ids.indexOf(fix));

    // Reactivar: contactado hace 100 días, sin respuesta ni seguimiento pendiente.
    await db.q("UPDATE prospects SET stage = 'lost', contacted_at = now() - interval '100 days' WHERE id = $1", [fix]);
    expect((await plus.reactivationCandidates()).map((r) => r.id)).toContain(fix);
    await plus.reactivate(fix, u.id);
    const re = await db.one<{ stage: string; reactivated_at: string | null }>("SELECT stage, reactivated_at FROM prospects WHERE id = $1", [fix]);
    expect(re?.stage).toBe("to_contact");
    expect(re?.reactivated_at).not.toBeNull();
    expect((await plus.reactivationCandidates()).map((r) => r.id)).not.toContain(fix);

    // Cliente → borrador de caso (no se sugiere hasta publicarlo).
    await crm.setStage(mob, "client", u.id);
    const draft = await db.one<{ draft: boolean; title: string }>("SELECT draft, title FROM case_studies WHERE prospect_id = $1", [mob]);
    expect(draft?.draft).toBe(true);
    expect((await cases.listCases()).some((c) => c.prospect_id === mob)).toBe(false);
    expect((await cases.listCases(true)).some((c) => c.prospect_id === mob)).toBe(true);
  });
  it("Notion: traer datos vincula por nombre, completa vacíos y respeta el apagado", async () => {
    const { db } = mod;
    const { pullFromNotion } = await import("../src/lib/agents/notion-pull");
    const { runJob } = await import("../src/lib/agents/orchestrator");
    const p = (await db.one<{ id: number }>(
      "INSERT INTO prospects (source, source_id, name, website, status, niche_key) VALUES ('manual','N1','Hostal Brisa','https://app.es','enriched','hospitality') RETURNING id",
    ))!.id;
    const page = (name: string, phone: string, web: string) => ({
      id: "abc-123",
      properties: {
        Name: { type: "title", title: [{ plain_text: name }] },
        Phone: { type: "phone_number", phone_number: phone },
        Webpage: { type: "url", url: web },
      },
    });
    const fakeNotion = {
      schema: async () => ({ Name: "title", Phone: "phone_number", Webpage: "url" }),
      queryPages: async () => [page("hostal brisa", "+34 611 222 333", "https://notion.es"), page("Otro", "1", "x")],
    } as never;
    const r = await pullFromNotion(() => {}, fakeNotion);
    expect(r).toMatchObject({ pages: 2, linked: 1, filled: 1 });
    const row = await db.one<{ notion_page_id: string; phone: string; website: string }>("SELECT notion_page_id, phone, website FROM prospects WHERE id = $1", [p]);
    expect(row).toEqual({ notion_page_id: "abc-123", phone: "+34 611 222 333", website: "https://app.es" });
    // Con Notion apagado el trabajo no hace nada.
    await db.setSetting("notion_enabled", false);
    expect(await runJob({ type: "notion_pull", payload: {} }, () => {})).toEqual({ skipped: true });
    expect(await runJob({ type: "sync_notion", payload: { part: "props" } }, () => {})).toEqual({ skipped: true });
  });
  it("Notion: numerar y corregir filas sin Num (sigue desde el último)", async () => {
    const { db } = mod;
    const { fixNotionNumbers } = await import("../src/lib/agents/notion-fix");
    const { NotionClient } = await import("../src/lib/notion");
    const pid = (await db.one<{ id: number }>(
      "INSERT INTO prospects (source, source_id, name, category, phone, status, niche_key, notion_page_id) VALUES ('manual','NF1','Hotel Viejo','Guest House / Hostal','+34 611 000 222','synced','hospitality','aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee') RETURNING id",
    ))!.id;
    const patches: Record<string, Record<string, any>> = {};
    const fake = (async (url: string, init: RequestInit) => {
      const body = init.body ? JSON.parse(String(init.body)) : {};
      let json: unknown = {};
      if (url.endsWith("/databases/0123456789abcdef0123456789abcdef"))
        json = {
          properties: {
            Name: { type: "title" }, Num: { type: "number" }, " Category": { type: "multi_select", multi_select: { options: [{ name: "Board / Accommodation" }] } },
            Area: { type: "select", select: { options: [{ name: "Random" }, { name: "San Blas" }] } },
            State: { type: "status", status: { options: [{ name: "Pending Contact" }, { name: "Contacted #1" }] } },
            "Social Networks": { type: "multi_select", multi_select: { options: [{ name: "【🟢】 Whatsapp" }] } },
            Type: { type: "select", select: { options: [{ name: "Normal" }, { name: "Franchise" }] } },
          },
        };
      else if (url.endsWith("/query"))
        json = body.filter?.number?.is_empty
          ? { results: [{ id: "aaaaaaaabbbbccccddddeeeeeeeeeeee", properties: { State: { type: "status", status: null } } }, { id: "manual-row", properties: {} }], has_more: false }
          : { results: [{ id: "x", properties: { Num: { type: "number", number: 243 } } }] };
      else if (init.method === "PATCH") patches[url.split("/pages/")[1]] = body.properties;
      return { ok: true, status: 200, headers: new Headers(), json: async () => json, text: async () => "" };
    }) as unknown as typeof fetch;
    const r = await fixNotionNumbers(() => {}, new NotionClient("tok", "0123456789abcdef0123456789abcdef", fake));
    expect(r).toMatchObject({ numbered: 2, fixed: 1 });
    const linked = patches["aaaaaaaabbbbccccddddeeeeeeeeeeee"];
    expect(linked.Num).toEqual({ number: 244 });
    expect(linked[" Category"]).toEqual({ multi_select: [{ name: "Board / Accommodation" }] });
    expect(linked.Area).toEqual({ select: { name: "Random" } });
    expect(linked.State).toEqual({ status: { name: "Pending Contact" } });
    expect(linked["Social Networks"]).toEqual({ multi_select: [{ name: "【🟢】 Whatsapp" }] });
    expect(patches["manual-row"]).toEqual({ Num: { number: 245 } });
    await db.q("DELETE FROM prospects WHERE id = $1", [pid]);
  });
  it("Barrios: se completan desde OpenStreetMap y corrigen el Area genérico en Notion", async () => {
    const { db } = mod;
    const { fillAreas } = await import("../src/lib/agents/agents-plus");
    const { fixNotionAreas } = await import("../src/lib/agents/notion-fix");
    const { NotionClient } = await import("../src/lib/notion");
    await db.q("UPDATE prospects SET area = '' WHERE area IS NULL");
    const pid = (await db.one<{ id: number }>(
      "INSERT INTO prospects (source, source_id, name, lat, lng, status, niche_key, notion_page_id) VALUES ('manual','AR1','Hostal Barrio',38.35,-0.48,'synced','hospitality','11111111-2222-3333-4444-555555555555') RETURNING id",
    ))!.id;
    const osm = (async () => ({ ok: true, status: 200, json: async () => ({ address: { suburb: "San Blas - Santo Domingo", city: "Alicante" } }) })) as unknown as typeof fetch;
    const r = await fillAreas(() => {}, 10, osm);
    expect(r.found).toBe(1);
    expect((await db.one<{ area: string }>("SELECT area FROM prospects WHERE id = $1", [pid]))?.area).toBe("San Blas - Santo Domingo");
    const patches: Record<string, unknown>[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      let json: unknown = {};
      if (url.endsWith("/databases/db")) json = { properties: { Name: { type: "title" }, Area: { type: "select", select: { options: [{ name: "Random" }, { name: "San Blas" }] } } } };
      else if (url.endsWith("/query")) json = { results: [{ id: "11111111222233334444555555555555", properties: { Area: { type: "select", select: { name: "Random" } } } }], has_more: false };
      else if (init.method === "PATCH") patches.push(JSON.parse(String(init.body)).properties);
      return { ok: true, status: 200, headers: new Headers(), json: async () => json, text: async () => "" };
    }) as unknown as typeof fetch;
    expect(await fixNotionAreas(() => {}, new NotionClient("tok", "db", fake))).toBe(1);
    expect(patches[0]).toEqual({ Area: { select: { name: "San Blas" } } });
    await db.q("DELETE FROM prospects WHERE id = $1", [pid]);
  });
  it("optimización: no duplica trabajos en cola y la IA empieza por los de mejor puntaje con reseñas", async () => {
    const { db, jobs } = mod;
    const a = await jobs.enqueue("rescore", { x: 1 });
    const b = await jobs.enqueue("rescore", { x: 1 });
    expect(b?.id).toBe(a?.id);
    const picked = await jobs.pickJob(["rescore"]);
    expect(picked?.id).toBe(a?.id);
    expect(await jobs.pickJob(["map_localities"])).toBeNull();
    await db.q("DELETE FROM jobs WHERE id = $1", [a!.id]);

    const { runWriterAgent } = await import("../src/lib/agents/agent34-writer");
    const order: number[] = [];
    const llm = { complete: async (prompt: string) => { order.push(prompt.includes("Opti Alto") ? 2 : 1); return { mode: "anthropic" as const, text: "x", model: "t" }; } };
    const mk = async (name: string, score: number, reviews: number) => {
      const id = (await db.one<{ id: number }>(
        "INSERT INTO prospects (source, source_id, name, status, niche_key, score) VALUES ('manual',$1,$1,'enriched','hospitality',$2) RETURNING id",
        [name, score],
      ))!.id;
      for (let i = 0; i < reviews; i++) await db.q("INSERT INTO reviews (prospect_id, author, rating, text) VALUES ($1,'t',2,$2)", [id, `queja ${i}`]);
      return id;
    };
    const lo = await mk("Opti Bajo", 30, 3);
    const hi = await mk("Opti Alto", 90, 3);
    const none = await mk("Opti Sin", 99, 1);
    await db.setSetting("min_reviews_ai", 2);
    await db.q("UPDATE prospects SET status = 'synced' WHERE status = 'enriched' AND id NOT IN ($1,$2,$3)", [lo, hi, none]);
    const r = await runWriterAgent("message", llm as never, 10);
    expect(r.processed).toBe(2);
    expect(order).toEqual([2, 1]);
    expect(await db.one("SELECT 1 FROM outputs WHERE prospect_id = $1", [none])).toBeNull();
  });
  it("Agente 1: divide la ciudad en barrios oficiales y el Area pasa a ser la zona exacta", async () => {
    const { db } = mod;
    const { splitLocality } = await import("../src/lib/agents/agent1-mapper");
    const { notionFields } = await import("../src/lib/agents/agent2-collector");
    const region = (await db.one<{ id: number }>(
      "INSERT INTO regions (name, origin_lat, origin_lng, status, position) VALUES ('Ciudad Test', 38.3, -0.5, 'queued', 99) RETURNING id",
    ))!.id;
    const sq = (x: number, y: number, w: number, h: number) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];
    const city = (await db.one<{ id: number }>(
      `INSERT INTO localities (region_id, name, osm_id, admin_level, boundary, status) VALUES ($1, 'Ciudad Test', 'relation/900', 8, $2::jsonb, 'mapped') RETURNING id`,
      [region, JSON.stringify({ type: "Polygon", coordinates: [sq(0, 0, 2, 1)] })],
    ))!.id;
    const pa = (await db.one<{ id: number }>("INSERT INTO prospects (source, source_id, name, lat, lng, locality_id, niche_key) VALUES ('manual','SB1','Hostal Oeste',0.5,0.5,$1,'hospitality') RETURNING id", [city]))!.id;
    const pb = (await db.one<{ id: number }>("INSERT INTO prospects (source, source_id, name, lat, lng, locality_id, niche_key) VALUES ('manual','SB2','Hostal Este',0.5,1.5,$1,'hospitality') RETURNING id", [city]))!.id;
    const rel = (id: number, name: string, ring: number[][]) => ({
      type: "relation", id, tags: { name, admin_level: "10", boundary: "administrative" },
      members: [{ type: "way", ref: id, role: "outer", geometry: ring.map(([lon, lat]) => ({ lat, lon })) }],
    });
    const fake = async () => [rel(901, "San Blas", sq(0, 0, 1, 1)), rel(902, "Benalúa", sq(1, 0, 1, 1)), rel(903, "Centro", sq(5, 5, 1, 1))] as never;
    const r = await splitLocality(city, () => {}, fake);
    expect(r).toMatchObject({ split: 3, moved: 2, total: 2 });
    const names = await db.q<{ name: string; locality: string }>(
      "SELECT p.name, l.name AS locality FROM prospects p JOIN localities l ON l.id = p.locality_id WHERE p.id = ANY($1) ORDER BY p.name",
      [[pa, pb]],
    );
    expect(names).toEqual([{ name: "Hostal Este", locality: "Benalúa" }, { name: "Hostal Oeste", locality: "San Blas" }]);
    expect((await db.one<{ status: string }>("SELECT status FROM localities WHERE id = $1", [city]))?.status).toBe("skipped");
    expect((await db.one<{ status: string }>("SELECT status FROM localities WHERE osm_id = 'relation/901'"))?.status).toBe("mapped");
    expect((await notionFields(pa)).region).toBe("San Blas");
    await db.q("DELETE FROM prospects WHERE id = ANY($1)", [[pa, pb]]);
    await db.q("DELETE FROM regions WHERE id = $1", [region]);
  });
});
