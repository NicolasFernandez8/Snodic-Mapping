import { describe, expect, it } from "vitest";

describe("Overpass con reintentos y servidores alternativos", () => {
  it("reintenta ante 429 y pasa al servidor siguiente", async () => {
    process.env.DATABASE_URL ??= "postgres://unused";
    const { overpass, OVERPASS_MIRRORS } = await import("../src/lib/geo/osm");
    const calls: string[] = [];
    const fake = (async (url: string) => {
      calls.push(url);
      if (url === OVERPASS_MIRRORS[0]) return new Response("too many", { status: 429 });
      return Response.json({ elements: [{ type: "node", id: 1 }] });
    }) as unknown as typeof fetch;
    const els = await overpass("[out:json];node(1);out;", { fetchImpl: fake, sleep: async () => {}, cache: false });
    expect(els).toHaveLength(1);
    expect(calls.filter((c) => c === OVERPASS_MIRRORS[0])).toHaveLength(3);
    expect(calls.at(-1)).toBe(OVERPASS_MIRRORS[1]);
  });
  it("no reintenta errores de consulta (400) en el mismo servidor", async () => {
    const { overpass } = await import("../src/lib/geo/osm");
    let n = 0;
    const fake = (async () => {
      n++;
      return new Response("bad query", { status: 400 });
    }) as unknown as typeof fetch;
    await expect(overpass("x", { fetchImpl: fake, sleep: async () => {}, cache: false })).rejects.toThrow(/Overpass no respondió/);
    expect(n).toBe(3); // uno por servidor
  });
});
