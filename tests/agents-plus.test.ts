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
