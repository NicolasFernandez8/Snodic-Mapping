process.env.DATABASE_URL ??= "postgres://x@localhost/x";
import { describe, expect, it } from "vitest";
import {
  bestContactTime,
  emailLink,
  instagramProfile,
  meetingQuestions,
  phoneType,
  reactivationMessage,
  replyPrompt,
  seasonAdvice,
} from "../src/lib/extras";
import { reverseAddress, spainHolidays, wikidataInfo } from "../src/lib/enrich";

const fake = (body: unknown, ok = true) => (async () => ({ ok, status: ok ? 200 : 500, json: async () => body })) as unknown as typeof fetch;

describe("agentes 6–17 (lógica pura)", () => {
  it("detecta móvil vs fijo (España)", () => {
    expect(phoneType("+34 612 345 678")).toBe("mobile");
    expect(phoneType("965 123 456")).toBe("landline");
    expect(phoneType(null)).toBe("unknown");
  });
  it("mejor horario: alojamientos fuera de check-in/out, y aprende de respuestas", () => {
    expect(bestContactTime({ business_hours: null, category: "hotel" })).toMatch(/11:00/);
    expect(bestContactTime({ business_hours: null, category: "hotel" }, [17, 17, 17, 10, 17])).toMatch(/17:00 y 18:00/);
    // Respuestas de madrugada no cuentan.
    expect(bestContactTime({ business_hours: null, category: "hotel" }, [5, 5, 5, 5, 5, 5])).not.toMatch(/05:00/);
  });
  it("canal alternativo con línea de baja", () => {
    const m = emailLink("info@hotel.es", "Hola");
    expect(m).toMatch(/^mailto:info@hotel\.es\?/);
    expect(decodeURIComponent(m!)).toMatch(/baja/);
    expect(emailLink(null, "x")).toBeNull();
    expect(instagramProfile("@hotelsol")).toBe("https://www.instagram.com/hotelsol/");
  });
  it("prompt de respuesta, reactivación y preguntas", () => {
    expect(replyPrompt({ name: "H", theirReply: "¿precio?", ourMessage: "m", report: null, caseLine: null })).toMatch(/¿precio\?/);
    expect(reactivationMessage("teléfono")).toMatch(/teléfono/);
    expect(meetingQuestions(["reservas"]).length).toBeGreaterThan(3);
  });
  it("aviso de temporada entre 3 y 8 semanas antes", () => {
    const a = seasonAdvice([{ day: "2026-07-01", name: "Verano" }], new Date("2026-05-20T10:00:00Z"));
    expect(a).toEqual({ name: "Verano", days: 42, contactNow: true });
    expect(seasonAdvice([{ day: "2026-07-01", name: "Verano" }], new Date("2026-06-25T10:00:00Z"))!.contactNow).toBe(false);
  });
});

describe("APIs abiertas (con fetch falso)", () => {
  it("Wikidata: web, Instagram y cadena", async () => {
    const w = await wikidataInfo(
      "Q1",
      fake({ entities: { Q1: { claims: { P856: [{ mainsnak: { datavalue: { value: "https://h.es" } } }], P2003: [{ mainsnak: { datavalue: { value: "hsol" } } }], P749: [{}] } } } }),
    );
    expect(w).toEqual({ website: "https://h.es", instagram: "https://www.instagram.com/hsol/", facebook: undefined, chain: true });
    expect(await wikidataInfo("nope", fake({}))).toBeNull();
  });
  it("Nominatim: arma la dirección", async () => {
    const a = await reverseAddress(38.3, -0.4, fake({ address: { road: "Calle Mayor", house_number: "5", postcode: "03002", city: "Alicante" } }));
    expect(a).toBe("Calle Mayor 5, 03002 Alicante");
  });
  it("Nager.Date: nacionales + Comunidad Valenciana", async () => {
    const h = await spainHolidays(
      2026,
      fake([
        { date: "2026-01-01", localName: "Año Nuevo", global: true, counties: null },
        { date: "2026-03-19", localName: "San José", global: false, counties: ["ES-VC"] },
        { date: "2026-05-02", localName: "Madrid", global: false, counties: ["ES-MD"] },
      ]),
    );
    expect(h.map((x) => x.name)).toEqual(["Año Nuevo", "San José"]);
  });
});

describe("Notion: lectura de propiedades", () => {
  it("propText lee título, texto, url, select y trata '-' como vacío", async () => {
    const { propText } = await import("../src/lib/notion");
    expect(propText({ type: "title", title: [{ plain_text: "Hotel " }, { plain_text: "Sol" }] })).toBe("Hotel Sol");
    expect(propText({ type: "url", url: "https://h.es" })).toBe("https://h.es");
    expect(propText({ type: "select", select: { name: "Hotel" } })).toBe("Hotel");
    expect(propText({ type: "rich_text", rich_text: [{ plain_text: "-" }] })).toBeNull();
    expect(propText(undefined)).toBeNull();
  });
});

describe("arquitectura", () => {
  it("cada agente y proceso apunta a una página que existe y tiene traducción", async () => {
    const fs = await import("node:fs");
    const { ARCH, ARCH_FLOW } = await import("../src/lib/architecture");
    const { EN } = await import("../src/lib/i18n/en");
    const exists = (href: string) => {
      const path = href.split(/[?#]/)[0];
      return fs.existsSync(`src/app/(app)${path === "/" ? "" : path}/page.tsx`);
    };
    const keys = new Set(ARCH.map((a) => a.key));
    for (const a of ARCH) {
      expect(exists(a.href), a.href).toBe(true);
      expect(EN[a.label] ?? (a.label === "Notion" ? "ok" : undefined), a.label).toBeTruthy();
      for (const p of a.processes) {
        expect(exists(p.href), p.href).toBe(true);
        expect(EN[p.label], p.label).toBeTruthy();
        expect(EN[p.desc], p.desc).toBeTruthy();
      }
    }
    for (const [a, b] of ARCH_FLOW) expect(keys.has(a) && keys.has(b)).toBe(true);
    // Las anclas de Agentes existen para cada agente numerado.
    const agentes = fs.readFileSync("src/app/(app)/agentes/page.tsx", "utf8");
    expect(agentes).toContain("id={`agente-${f.n}`}");
  });
});

describe("esquemas de solución", () => {
  const report = `IDEA 1
Problema:
Varios huéspedes dicen que nadie contesta el teléfono para cambiar la reserva.
Solución:
Respuestas rápidas por WhatsApp con un formulario de cambios que avisa al móvil del dueño.
Impacto:
Menos reservas perdidas y mejores reseñas.
Clave:
Usa el WhatsApp que ya tienen.
Implementación:
Configurar WhatsApp Business con respuestas rápidas y Google Forms.

IDEA 2
Problema:
La habitación no está lista cuando llegan.
Solución:
Un mensaje automático 24 h antes pide la hora de llegada, más un checklist en el móvil.
Impacto:
Llegadas sin esperas.`;
  it("arma un esquema por idea con canal, sistema de Snodic, pasos y resultado", async () => {
    const { schemesFromReport, SCHEME_LABELS } = await import("../src/lib/schemes");
    const { EN } = await import("../src/lib/i18n/en");
    const s = schemesFromReport(report);
    expect(s).toHaveLength(2);
    const labels = (k: number) => s[k].nodes.map((n) => n.label);
    expect(labels(0)[0]).toBe("WhatsApp");
    expect(labels(0)).toContain("Respuestas rápidas");
    expect(labels(0)).toContain("Formulario");
    expect(labels(0)).toContain("Aviso al equipo");
    expect(labels(0).at(-1)).toBe("Mejores reseñas");
    expect(labels(1)).toContain("Mensaje automático");
    expect(labels(1)).toContain("Checklist");
    expect(labels(1).at(-1)).toBe("Menos esperas");
    // Cada nodo intermedio conecta entrada y salida.
    for (const sc of s) {
      const ids = new Set(sc.nodes.map((n) => n.id));
      for (const [a, b] of sc.edges) expect(ids.has(a) && ids.has(b)).toBe(true);
      expect(sc.nodes.filter((n) => n.sol).length).toBe(3);
    }
    for (const l of SCHEME_LABELS) expect(EN[l], l).toBeTruthy();
    expect(schemesFromReport(null)).toEqual([]);
    expect(schemesFromReport("texto sin ideas")).toEqual([]);
  });
});

describe("períodos de métricas", () => {
  it("solo acepta valores conocidos y arma ventanas y series fijas", async () => {
    const { parsePeriod, windowInterval, bucket } = await import("../src/lib/periods");
    expect(parsePeriod("month")).toBe("month");
    expect(parsePeriod("'; DROP TABLE x;--")).toBe("all");
    expect(parsePeriod("all", "week", false)).toBe("week");
    expect(windowInterval("all")).toBeNull();
    expect(windowInterval("day")).toBe("1 day");
    expect(bucket("day")).toMatchObject({ unit: "day", n: 14 });
    expect(bucket("year")).toMatchObject({ unit: "year", n: 5 });
  });
});

describe("Notion: correlativo Num y link de la base", () => {
  it("acepta el link copiado de Notion como ID", async () => {
    const { notionId } = await import("../src/lib/notion");
    expect(notionId("https://www.notion.so/nico/Snodic-Mapping-0123456789abcdef0123456789abcdef?v=fedcba9876543210fedcba9876543210")).toBe("0123456789abcdef0123456789abcdef");
    expect(notionId("01234567-89ab-cdef-0123-456789abcdef")).toBe("0123456789abcdef0123456789abcdef");
  });
  it("las páginas nuevas siguen desde el último Num (243 → 244, 245) y las existentes no cambian", async () => {
    const { NotionClient } = await import("../src/lib/notion");
    const calls: { url: string; method: string; body: Record<string, unknown> }[] = [];
    let n = 0;
    const fake = (async (url: string, init: RequestInit) => {
      const body = init.body ? JSON.parse(String(init.body)) : {};
      calls.push({ url, method: String(init.method), body });
      const json = url.endsWith("/databases/0123456789abcdef0123456789abcdef")
        ? { properties: { Name: { type: "title" }, Num: { type: "number" }, Phone: { type: "phone_number" } } }
        : url.endsWith("/query")
          ? { results: [{ id: "x", properties: { Num: { type: "number", number: 243 } } }] }
          : { id: `page-${++n}` };
      return { ok: true, status: 200, headers: new Headers(), json: async () => json, text: async () => "" };
    }) as unknown as typeof fetch;
    const nc = new NotionClient("tok", "https://www.notion.so/x/Snodic-Mapping-0123456789abcdef0123456789abcdef?v=1", fake);
    await nc.upsertProspect(null, { name: "A" });
    await nc.upsertProspect(null, { name: "B" });
    await nc.upsertProspect("existente", { name: "C" });
    const creates = calls.filter((c) => c.url.endsWith("/pages") && c.method === "POST");
    expect(creates.map((c) => (c.body.properties as Record<string, { number: number }>).Num.number)).toEqual([244, 245]);
    const update = calls.find((c) => c.url.endsWith("/pages/existente"))!;
    expect((update.body.properties as Record<string, unknown>).Num).toBeUndefined();
    expect(calls.filter((c) => c.url.endsWith("/query"))).toHaveLength(1);
  });
});

describe("Notion: opciones de la base de Snodic", () => {
  const schema = { Name: "title", " Category": "multi_select", Area: "select", "Social Networks": "multi_select", Type: "select", Phone: "rich_text" };
  const options = {
    " Category": ["Gastropub / Restaurant", "Board / Accommodation"],
    Area: ["Paus", "Random", "San Blas"],
    "Social Networks": ["【🟢】 Whatsapp", "【🔵】Facebook", "【🟣】Instagram", "【🔴】Email", "【⚪】Call"],
    Type: ["Normal", "Qualified", "Franchise"],
  };
  const map = { name: "Name", category: "Category", region: "Area", social: "Social Networks", type: "Type", phone: "Phone" };
  it("usa las opciones existentes y Random si el barrio no está", async () => {
    const { buildProperties } = await import("../src/lib/notion");
    const { notionCategory, socialNetworks } = await import("../src/lib/agents/agent2-collector");
    const fields = {
      name: "Hotel Sol", phone: "+34 612 000 111", type: "Normal", region: "Centro", category: notionCategory("hotel"),
      social: socialNetworks({ phone: "+34 612 000 111", email: "a@b.es", instagram: "https://instagram.com/sol", facebook: null }),
    };
    const { properties } = buildProperties(fields, schema, map, options, true) as { properties: Record<string, any> };
    expect(properties[" Category"]).toEqual({ multi_select: [{ name: "Board / Accommodation" }] });
    // Barrio nuevo: se crea la opción (el Area es el barrio exacto); sin barrio → "Random".
    expect(properties.Area).toEqual({ select: { name: "Centro" } });
    const none = buildProperties({ ...fields, region: null }, schema, map, options, true) as { properties: Record<string, any> };
    expect(none.properties.Area).toEqual({ select: { name: "Random" } });
    expect(properties["Social Networks"].multi_select.map((o: { name: string }) => o.name)).toEqual(["【🟢】 Whatsapp", "【🟣】Instagram", "【🔴】Email"]);
    const sb = buildProperties({ ...fields, region: "San Blas" }, schema, map, options, true) as { properties: Record<string, any> };
    expect(sb.properties.Area).toEqual({ select: { name: "San Blas" } });
  });
  it("al actualizar no pisa Area, Category, Type ni Social Networks", async () => {
    const { buildProperties } = await import("../src/lib/notion");
    const { properties } = buildProperties({ name: "X", phone: "1", region: "Paus", category: "x", social: ["Instagram"], type: "Normal" }, schema, map, options, false);
    expect(Object.keys(properties).sort()).toEqual(["Name", "Phone"]);
  });
});

describe("barrio (Area)", () => {
  it("toma el barrio de OpenStreetMap y lo cruza con las opciones de Notion", async () => {
    const { pickArea, reverseArea } = await import("../src/lib/enrich");
    const { matchOption } = await import("../src/lib/notion");
    expect(pickArea({ suburb: "San Blas - Santo Domingo", city: "Alicante" })).toBe("San Blas - Santo Domingo");
    expect(pickArea({ neighbourhood: "Benalúa" })).toBe("Benalúa");
    expect(pickArea({ city: "Alicante" })).toBeNull();
    const a = await reverseArea(38.34, -0.49, fake({ address: { suburb: "San Agustín", city: "Alicante" } }));
    expect(a).toBe("San Agustín");
    const opts = ["Paus", "Random", "San Blas", "San Agustin", "Los Angeles"];
    expect(matchOption(opts, "San Agustín")).toBe("San Agustin");
    expect(matchOption(opts, "Los Ángeles")).toBe("Los Angeles");
    expect(matchOption(opts, "San Blas - Santo Domingo")).toBe("San Blas");
    expect(matchOption(opts, "Benalúa")).toBeNull();
  });
});

describe("migraciones", () => {
  it("todas fijan el esquema mapping (en la PC el usuario no lo tiene por defecto)", async () => {
    const fs = await import("node:fs");
    // 001_init.down.sql borra el esquema completo por nombre: no necesita search_path.
    const files = fs.readdirSync("db/migrations").filter((f) => f.endsWith(".sql") && f !== "001_init.down.sql");
    const sinEsquema = files.filter((f) => !/SET\s+search_path\s+TO\s+mapping/i.test(fs.readFileSync(`db/migrations/${f}`, "utf8")));
    expect(sinEsquema).toEqual([]);
  });
});

describe("IA local (Ollama)", () => {
  it("llama a /api/chat, limpia <think> y reporta el modelo", async () => {
    const { OllamaLlm, ollamaStatus } = await import("../src/lib/ai/llm");
    let body: any;
    const chat = (async (url: string, init: RequestInit) => {
      body = { url, ...JSON.parse(String(init.body)) };
      return { ok: true, status: 200, json: async () => ({ message: { content: "<think>pienso</think>\n¡Hola! Vi vuestras reseñas." } }) };
    }) as unknown as typeof fetch;
    const r = await new OllamaLlm("http://host:11434/", "qwen2.5:7b", chat).complete("prompt", 600);
    expect(r).toEqual({ mode: "ollama", text: "¡Hola! Vi vuestras reseñas.", model: "ollama:qwen2.5:7b" });
    expect(body.url).toBe("http://host:11434/api/chat");
    expect(body.stream).toBe(false);
    expect(body.options.num_predict).toBe(600);
    const tags = (async () => ({ ok: true, json: async () => ({ models: [{ name: "qwen2.5:7b" }] }) })) as unknown as typeof fetch;
    expect(await ollamaStatus(tags)).toMatchObject({ reachable: true, hasModel: true });
    const down = (async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof fetch;
    expect(await ollamaStatus(down)).toMatchObject({ reachable: false, hasModel: false });
  });
});

describe("IA local: huecos + plantilla exacta", () => {
  const input = { name: "Hotel Sol", reviewsUrl: "-", businessLabel: "alojamientos", reviews: [{ rating: 2, text: "Nadie contesta el teléfono" }] };
  it("el mensaje armado cumple todas las reglas de Snodic", async () => {
    const { assembleMessage } = await import("../src/lib/ai/local-structured");
    const { validateMessage } = await import("../src/lib/ai/validate");
    const msg = assembleMessage({ positivos: "Destacan la limpieza y la amabilidad.", problema: "[varios comentan] que cuesta reservar por teléfono", solucion: "responder las reservas al instante por WhatsApp", beneficio: "no perder reservas fuera de horario." }, "alojamientos");
    expect(validateMessage(msg, "Hotel Sol")).toEqual([]);
    expect(msg).toMatch(/^Hola!\n\nEstuve viendo sus reseñas y destacan la limpieza y la amabilidad\. También vi que varios comentan/);
    expect(msg).not.toMatch(/\[|\]/);
  });
  it("el informe armado tiene 2 ideas con los 7 pasos", async () => {
    const { assembleReport } = await import("../src/lib/ai/local-structured");
    const { validateReport } = await import("../src/lib/ai/validate");
    const idea = { problema: "a", solucion: "b", impacto: "c", clave: "d", implementacion: "e", como_venderlo: "f", como_medir: "g" };
    expect(validateReport(assembleReport({ ideas: [idea, idea] }))).toEqual([]);
  });
  it("reintenta si el modelo deja huecos vacíos y se queda con la mejor versión", async () => {
    const { generateLocal } = await import("../src/lib/ai/local-structured");
    const answers = [
      { positivos: "", problema: "", solucion: "", beneficio: "" },
      { positivos: "destacan la limpieza", problema: "cuesta reservar por teléfono", solucion: "responder por WhatsApp al instante", beneficio: "no perder reservas" },
    ];
    let calls = 0;
    const llm = { completeJson: async () => ({ data: answers[Math.min(calls++, 1)], model: "ollama:test" }) };
    const r = await generateLocal("message", input, llm);
    expect(calls).toBe(2);
    expect(r.issues).toEqual([]);
    expect(r.text.startsWith("Hola!")).toBe(true);
  });
});
