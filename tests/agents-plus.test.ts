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
