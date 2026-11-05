import { describe, expect, it } from "vitest";
import {
  bbox,
  buildArea,
  centroid,
  haversineKm,
  pointInArea,
  splitBbox,
  stitchRings,
  type Position,
} from "../src/lib/geo/geometry";
import { relationToBoundary } from "../src/lib/geo/osm";
import { toKml } from "../src/lib/geo/kml";
import { parseKmlSectors } from "../src/lib/geo/kml-import";
import { matchesNiche, PlacesClient } from "../src/lib/sources/places";
import { buildProperties, paragraphs, toNotionValue } from "../src/lib/notion";
import { validateMessage, validateReport } from "../src/lib/ai/validate";
import { messagePrompt, reportPrompt } from "../src/lib/ai/prompts";
import { cleanOutput } from "../src/lib/agents/agent34-writer";
import { instagramFromWebsite, reviewsLink } from "../src/lib/agents/agent2-collector";

const square = (x: number, y: number, s: number): Position[] => [
  [x, y],
  [x + s, y],
  [x + s, y + s],
  [x, y + s],
  [x, y],
];

describe("geometría", () => {
  it("une segmentos desordenados e invertidos en un anillo", () => {
    const rings = stitchRings([
      [
        [0, 0],
        [1, 0],
      ],
      [
        [1, 1],
        [1, 0],
      ], // invertido
      [
        [1, 1],
        [0, 1],
        [0, 0],
      ],
    ]);
    expect(rings).toHaveLength(1);
    expect(rings[0][0]).toEqual(rings[0][rings[0].length - 1]);
  });

  it("respeta huecos al evaluar punto en área", () => {
    const area = buildArea([square(0, 0, 10)], [square(4, 4, 2)])!;
    expect(pointInArea([1, 1], area)).toBe(true);
    expect(pointInArea([5, 5], area)).toBe(false);
    expect(pointInArea([11, 1], area)).toBe(false);
  });

  it("calcula bbox, centroide y distancia", () => {
    const area = buildArea([square(0, 0, 2)], [])!;
    expect(bbox(area)).toEqual([0, 0, 2, 2]);
    const c = centroid(area);
    expect(c[0]).toBeCloseTo(1);
    expect(c[1]).toBeCloseTo(1);
    // Alicante → Elche ≈ 20 km
    expect(haversineKm([-0.4907, 38.3452], [-0.7015, 38.2699])).toBeGreaterThan(18);
    expect(splitBbox([0, 0, 2, 2], 2)).toHaveLength(4);
  });

  it("convierte una relación de Overpass en límite", () => {
    const g = (pts: Position[]) => pts.map(([lon, lat]) => ({ lat, lon }));
    const b = relationToBoundary({
      type: "relation",
      id: 42,
      tags: { name: "Alacant / Alicante", "name:es": "Alicante", admin_level: "8" },
      members: [
        { type: "way", ref: 1, role: "outer", geometry: g(square(0, 0, 1).slice(0, 3)) },
        { type: "way", ref: 2, role: "outer", geometry: g(square(0, 0, 1).slice(2)) },
      ],
    });
    expect(b?.name).toBe("Alicante");
    expect(b?.osmId).toBe("relation/42");
    expect(b?.area.type).toBe("Polygon");
  });
});

describe("KML", () => {
  it("exporta y vuelve a importar sectores", () => {
    const area = buildArea([square(-0.5, 38.3, 0.1)], [])!;
    const kml = toKml(
      "Snodic & Alicante",
      [{ name: "Centro <1>", status: "mapped", area, prospects: 3 }],
      [{ name: "Hotel A&B", locality: "Centro", lat: 38.35, lng: -0.45, description: { Teléfono: null } }],
    );
    expect(kml).toContain("Snodic &amp; Alicante");
    expect(kml).toContain("Teléfono: -");
    const sectors = parseKmlSectors(kml);
    expect(sectors).toHaveLength(1);
    expect(sectors[0].name).toBe("Centro <1>");
    expect(pointInArea([-0.45, 38.35], sectors[0].area)).toBe(true);
  });
});

describe("Google Places", () => {
  it("filtra por rubro", () => {
    expect(matchesNiche({ types: ["lodging", "point_of_interest"] }, ["hotel", "lodging"])).toBe(true);
    expect(matchesNiche({ types: ["restaurant"] }, ["hotel"])).toBe(false);
    expect(matchesNiche({ types: ["restaurant"] }, [])).toBe(true);
  });

  it("pagina Text Search y mapea detalles con reseñas", async () => {
    const calls: { url: string; body?: string; headers: Record<string, string> }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: init.body as string, headers: init.headers as Record<string, string> });
      if (url.endsWith(":searchText")) {
        const body = JSON.parse(init.body as string);
        const page = body.pageToken ? 2 : 1;
        return Response.json({
          places: [{ id: `p${page}`, displayName: { text: `Hotel ${page}` }, types: ["hotel"], location: { latitude: 38.3, longitude: -0.5 } }],
          nextPageToken: page === 1 ? "tok" : undefined,
        });
      }
      return Response.json({
        id: "p1",
        displayName: { text: "Hotel 1" },
        types: ["hotel"],
        internationalPhoneNumber: "+34 600 000 000",
        websiteUri: "https://hotel1.es",
        googleMapsLinks: { reviewsUri: "https://maps.google.com/?cid=1&reviews" },
        reviews: [
          { rating: 5, originalText: { text: "Muy limpio", languageCode: "es" }, authorAttribution: { displayName: "Ana" } },
          { rating: 2, text: { text: "" } },
        ],
      });
    }) as unknown as typeof fetch;
    const c = new PlacesClient("KEY", fake, 0);
    const res = await c.textSearch("hotel en Alicante", [-0.6, 38.2, -0.4, 38.4]);
    expect(res.map((r) => r.id)).toEqual(["p1", "p2"]);
    expect(calls[0].headers["X-Goog-Api-Key"]).toBe("KEY");
    const d = await c.details("p1");
    expect(d.phone).toBe("+34 600 000 000");
    expect(d.reviewsUrl).toContain("reviews");
    expect(d.reviews).toHaveLength(1);
  });
});

describe("Notion", () => {
  it("escribe '-' en texto y null en tipos que no admiten texto", () => {
    expect(toNotionValue("rich_text", null)).toEqual({ rich_text: [{ type: "text", text: { content: "-" } }] });
    expect(toNotionValue("url", "")).toEqual({ url: null });
    expect(toNotionValue("number", "4.5")).toEqual({ number: 4.5 });
    expect(toNotionValue("select", "Alicante, Centro")).toEqual({ select: { name: "Alicante  Centro" } });
  });

  it("arma propiedades según el esquema y avisa las faltantes", () => {
    const { properties, missing } = buildProperties(
      { name: "Hotel", phone: null, rating: 4.2 },
      { Nombre: "title", Teléfono: "rich_text", Rating: "number" },
      { name: "Nombre", phone: "Teléfono", rating: "Rating", email: "Email" },
    );
    expect(Object.keys(properties)).toEqual(["Nombre", "Teléfono", "Rating"]);
    expect(missing).toEqual(["Email"]);
  });

  it("deja 2 párrafos vacíos antes del informe", () => {
    const blocks = paragraphs("\n\nIDEA 1") as { paragraph: { rich_text: unknown[] } }[];
    expect(blocks).toHaveLength(3);
    expect(blocks[0].paragraph.rich_text).toEqual([]);
    expect(blocks[1].paragraph.rich_text).toEqual([]);
  });
});

const GOOD_MESSAGE = `Hola!

Estuve viendo sus reseñas y la gente destaca mucho la limpieza y lo amable que es el personal. También vi que varios comentan que cuesta mucho contactar para reservar por teléfono.

Me llamo Nico y justamente me especializo en montar un sistema de respuesta automática por WhatsApp para reservas, para que no se os escape ninguna reserva fuera de horario.

En una primera etapa sería totalmente gratuito para vosotros. La idea es analizar vuestro caso, ver si podemos aportar algo de valor.

Estoy trabajando ahora con algunos alojamientos en esto para documentar resultados en este tipo de locales y me dijeron que me comunique con ustedes pero no me dijeron con quien. Con quien podría hablar del tema?`;

const SECTIONS = `Problema:
x
Solución:
x
Impacto:
x
Clave:
x
Implementación:
x
Cómo venderlo:
x
Cómo medir resultados:
x`;

describe("validaciones de agentes 3 y 4", () => {
  it("acepta un mensaje correcto", () => {
    expect(validateMessage(GOOD_MESSAGE, "Hotel Mediterráneo")).toEqual([]);
  });
  it("detecta nombre del local, frases vagas y marcadores", () => {
    const issues = validateMessage(
      GOOD_MESSAGE.replace("la limpieza", "la limpieza del Hotel Sol [X]") + " mejorar la experiencia",
      "Hotel Sol",
    );
    expect(issues).toContain("Menciona el nombre del local");
    expect(issues.some((i) => i.includes("mejorar la experiencia"))).toBe(true);
  });
  it("exige exactamente 2 ideas con 7 secciones", () => {
    expect(validateReport(`IDEA 1\n${SECTIONS}\nIDEA 2\n${SECTIONS}`)).toEqual([]);
    expect(validateReport(`IDEA 1\n${SECTIONS}`)[0]).toMatch(/EXACTAMENTE 2/);
    expect(validateReport(`IDEA 1\n${SECTIONS}\nIDEA 2\nProblema:\n`).length).toBeGreaterThan(0);
  });
  it("limpia markdown del modelo", () => {
    expect(cleanOutput("```\n**IDEA 1**\n```")).toBe("IDEA 1");
  });
});

describe("prompts", () => {
  const input = {
    name: "Hotel Sol",
    reviewsUrl: "https://maps/x",
    businessLabel: "alojamientos",
    reviews: [{ rating: 4, text: "Buen   desayuno" }],
  };
  it("incluyen local, enlace, reseñas y tipo de negocio", () => {
    const m = messagePrompt(input);
    expect(m).toContain("Hotel Sol");
    expect(m).toContain("https://maps/x");
    expect(m).toContain("Reseña 1 (4★): Buen desayuno");
    expect(m).toContain("algunos alojamientos");
    expect(reportPrompt(input)).toContain("EXACTAMENTE 2 ideas");
  });
  it("advierten si no hay reseñas", () => {
    expect(messagePrompt({ ...input, reviews: [] })).toContain("No inventes datos");
  });
});

describe("helpers del agente 2", () => {
  it("prioriza el enlace de reseñas", () => {
    expect(reviewsLink({ reviews_url: null, google_maps_url: "g" })).toBe("g");
    expect(reviewsLink({ reviews_url: "r", google_maps_url: "g" })).toBe("r");
  });
  it("detecta Instagram como web", () => {
    expect(instagramFromWebsite("https://www.instagram.com/hotel.sol/")).toBe("https://instagram.com/hotel.sol");
    expect(instagramFromWebsite("https://hotel.es")).toBeNull();
  });
});

describe("modo gratuito", () => {
  it("parsea reseñas pegadas a mano", async () => {
    const { parsePastedReviews } = await import("../src/lib/agents/agent2-collector");
    const r = parsePastedReviews("5★ Muy limpio\n\n2/5 - Nadie atiende\n\nSin estrellas\nsegunda línea\n\n  ");
    expect(r).toEqual([
      { rating: 5, text: "Muy limpio" },
      { rating: 2, text: "Nadie atiende" },
      { rating: null, text: "Sin estrellas\nsegunda línea" },
    ]);
  });
  it("arma un link público de búsqueda en Google Maps", async () => {
    const { mapsSearchUrl } = await import("../src/lib/agents/agent1-mapper");
    expect(mapsSearchUrl("Hotel Sol", "Alicante")).toBe(
      "https://www.google.com/maps/search/?api=1&query=Hotel%20Sol%20Alicante",
    );
  });
});

describe("campos de la base de Notion de Snodic", () => {
  it("traduce opening_hours de OSM", async () => {
    const { parseOpeningHours } = await import("../src/lib/opening-hours");
    expect(parseOpeningHours("Mo-Su 12:30-16:00")).toEqual({ days: "Lunes a Domingo", hours: "12:30 a 16:00" });
    expect(parseOpeningHours("24/7")).toEqual({ days: "Lunes a Domingo", hours: "24 horas" });
    expect(parseOpeningHours("Mo-Fr 09:00-14:00,17:00-20:00")).toEqual({
      days: "Lunes a Viernes",
      hours: "09:00 a 14:00 y 17:00 a 20:00",
    });
    expect(parseOpeningHours("Mo-Fr 09:00-18:00; Sa 10:00-14:00; Su off")).toEqual({
      days: "Lunes a Viernes, Sábado",
      hours: "Lunes a Viernes: 09:00 a 18:00 · Sábado: 10:00 a 14:00",
    });
    expect(parseOpeningHours("sunrise-sunset")).toBeNull();
    expect(parseOpeningHours(null)).toBeNull();
  });
  it("formatea teléfono y contacto como en Notion", async () => {
    const { formatPhone, contactInfo } = await import("../src/lib/agents/agent2-collector");
    expect(formatPhone("+34 624 20 72 88")).toBe("34624207288");
    expect(formatPhone("624207288")).toBe("34624207288");
    expect(formatPhone("+34 965 11 11 11; +34 600 00 00 00")).toBe("34965111111");
    expect(contactInfo({ instagram: "https://www.instagram.com/18teatro/", facebook: "https://www.facebook.com/x" })).toBe(
      "https://www.instagram.com/18teatro/ [] https://www.facebook.com/x",
    );
    expect(contactInfo({ instagram: "@18teatro", facebook: null })).toBe("https://www.instagram.com/18teatro/");
    expect(contactInfo({ instagram: null, facebook: null })).toBeNull();
  });
  it("resuelve propiedades por nombre exacto, mayúsculas, prefijo o título", async () => {
    const { resolveProperty } = await import("../src/lib/notion");
    const schema = { Nombre: "title", "Rating - Google Maps": "number", webpage: "url" };
    expect(resolveProperty(schema, "Rating - Google")).toBe("Rating - Google Maps");
    expect(resolveProperty(schema, "Webpage")).toBe("webpage");
    expect(resolveProperty(schema, "Name", "name")).toBe("Nombre");
    expect(resolveProperty(schema, "Email")).toBeNull();
  });
  it("etiqueta categorías", async () => {
    const { categoryLabel } = await import("../src/lib/agents/agent1-mapper");
    expect(categoryLabel("guest_house")).toBe("Guest House / Hostal");
    expect(categoryLabel("camp_site")).toBe("Camp site");
  });
});

describe("contraseñas", () => {
  it("hashea con scrypt y verifica", async () => {
    const { hashPassword, verifyPassword } = await import("../src/lib/auth/password");
    const h = await hashPassword("una-clave-larga");
    expect(h.startsWith("scrypt$32768$8$1$")).toBe(true);
    expect(h).not.toContain("una-clave-larga");
    expect(await verifyPassword("una-clave-larga", h)).toBe(true);
    expect(await verifyPassword("otra-clave", h)).toBe(false);
    await expect(hashPassword("corta")).rejects.toThrow(/8 caracteres/);
  });
});

describe("captación", () => {
  it("arma links de WhatsApp oficiales", async () => {
    const { whatsappLink } = await import("../src/lib/crm");
    expect(whatsappLink("+34 624 20 72 88", "Hola!")).toBe("https://wa.me/34624207288?text=Hola!");
    expect(whatsappLink("624207288", "a b")).toBe("https://wa.me/34624207288?text=a%20b");
    expect(whatsappLink("123", "x")).toBeNull();
    expect(whatsappLink(null, "x")).toBeNull();
  });
  it("arma seguimientos con auditoría y caso", async () => {
    const { followUpMessage } = await import("../src/lib/crm");
    const m1 = followUpMessage(1, "https://x/a/abc", "un hotel del centro a conseguir +20 % de reservas");
    expect(m1).toContain("https://x/a/abc");
    expect(m1).toContain("+20 %");
    expect(m1).toContain("¿Con quién podría hablarlo?");
    expect(followUpMessage(2, null, null)).toContain("Último mensaje");
  });
  it("puntúa prospectos con motivos", async () => {
    const { scoreProspect, detectPains } = await import("../src/lib/scoring");
    const reviews = [
      { rating: 2, text: "Llamé tres veces para reservar y nadie contestó" },
      { rating: 5, text: "Todo perfecto, reservé sin problema" },
      { rating: 3, text: "El check-in tardó media hora" },
    ];
    expect(detectPains(reviews).map((p) => p.tag)).toEqual(expect.arrayContaining(["reservas", "teléfono", "check-in", "espera"]));
    const s = scoreProspect({ phone: "1", website: "w", email: null, instagram: null, facebook: null, rating: 4.1, reviews_count: 120, category: "Hotel", reviews });
    expect(s.score).toBeGreaterThan(60);
    expect(s.score).toBeLessThanOrEqual(100);
    expect(s.items.some((i) => i.reason.includes("reservas"))).toBe(true);
    expect(scoreProspect({ phone: null, website: null, email: null, instagram: null, facebook: null, rating: null, reviews_count: null, category: null, reviews: [] }).score).toBe(0);
  });
  it("sugiere casos por problema", async () => {
    const { matchCases } = await import("../src/lib/cases");
    const cases = [
      { id: 1, title: "A", tags: ["reservas"], summary: "s", result: null, link: null },
      { id: 2, title: "B", tags: ["precio"], summary: "s", result: null, link: null },
    ];
    expect(matchCases(cases, [{ rating: 1, text: "imposible reservar" }]).map((c) => c.id)).toEqual([1]);
  });
  it("extrae ideas del informe para la mini-auditoría", async () => {
    const { parseReport } = await import("../src/lib/audit");
    const ideas = parseReport("IDEA 1\nProblema:\nNo contestan\nSolución:\nBot de WhatsApp\nImpacto:\nMás reservas\nClave:\nfácil\nIDEA 2\nProblema:\nCheck-in lento\nSolución:\nCheck-in online\nImpacto:\nMenos espera");
    expect(ideas).toEqual([
      { problem: "No contestan", solution: "Bot de WhatsApp", impact: "Más reservas" },
      { problem: "Check-in lento", solution: "Check-in online", impact: "Menos espera" },
    ]);
  });
});

describe("idiomas", () => {
  it("traduce con interpolación y cae al español si falta", async () => {
    const { makeT } = await import("../src/lib/i18n/core");
    expect(makeT("en")("Página {p} de {n}", { p: 1, n: 3 })).toBe("Page 1 of 3");
    expect(makeT("es")("Página {p} de {n}", { p: 1, n: 3 })).toBe("Página 1 de 3");
    expect(makeT("en")("Texto sin traducir")).toBe("Texto sin traducir");
  });
  it("todos los textos de la interfaz tienen traducción al inglés", async () => {
    const { EN } = await import("../src/lib/i18n/en");
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const walk = (d: string): string[] =>
      readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
    const missing = new Set<string>();
    for (const f of walk("src/app").filter((f) => f.endsWith(".tsx") && !f.includes("/a/"))) {
      for (const m of readFileSync(f, "utf8").matchAll(/\bt\("((?:[^"\\]|\\.)*)"/g)) {
        const key = JSON.parse(`"${m[1]}"`);
        if (!(key in EN)) missing.add(key);
      }
    }
    expect([...missing]).toEqual([]);
  });
});

describe("calidad y rendimiento", () => {
  it("detecta el mismo negocio por teléfono o nombre cercano", async () => {
    const { isSameBusiness, nameKey, phoneKey } = await import("../src/lib/quality");
    expect(nameKey("Hotel Sol & Mar, S.L.")).toBe("sol mar");
    expect(phoneKey("+34 624 20 72 88")).toBe("34624207288");
    expect(isSameBusiness({ name: "A", phone: "624207288" }, { name: "B", phone: "+34 624 20 72 88" })).toBe(true);
    expect(isSameBusiness({ name: "Hotel Sol Mar", lat: 38.35, lng: -0.48 }, { name: "Sol Mar", lat: 38.3505, lng: -0.4805 })).toBe(true);
    expect(isSameBusiness({ name: "Hotel Sol Mar", lat: 38.35, lng: -0.48 }, { name: "Sol Mar", lat: 38.4, lng: -0.48 })).toBe(false);
    expect(isSameBusiness({ name: "Hostal Luna" }, { name: "Hotel Sol" })).toBe(false);
  });
  it("simplifica polígonos sin romperlos", async () => {
    const { simplifyArea } = await import("../src/lib/geo/simplify");
    const ring: [number, number][] = [];
    for (let i = 0; i <= 400; i++) {
      const a = (i / 400) * 2 * Math.PI;
      ring.push([Math.cos(a) * 0.05, Math.sin(a) * 0.05 + (i % 2 ? 0.00001 : 0)]);
    }
    ring[ring.length - 1] = ring[0];
    const s = simplifyArea({ type: "Polygon", coordinates: [ring] }, 0.0005);
    const out = (s as { coordinates: [number, number][][] }).coordinates[0];
    expect(out.length).toBeLessThan(80);
    expect(out.length).toBeGreaterThanOrEqual(4);
    expect(out[0]).toEqual(out[out.length - 1]);
  });
});
