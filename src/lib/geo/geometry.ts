export type Position = [number, number]; // [lng, lat]
export type Ring = Position[];
export type Polygon = { type: "Polygon"; coordinates: Ring[] };
export type MultiPolygon = { type: "MultiPolygon"; coordinates: Ring[][] };
export type Area = Polygon | MultiPolygon;

const key = (p: Position) => `${p[0].toFixed(7)},${p[1].toFixed(7)}`;

/**
 * Une segmentos (ways de OSM) en anillos cerrados, uniendo extremos coincidentes.
 * Los segmentos que no logran cerrar se descartan.
 */
export function stitchRings(segments: Position[][]): Ring[] {
  const pool = segments.filter((s) => s.length >= 2).map((s) => [...s]);
  const rings: Ring[] = [];
  while (pool.length) {
    let current = pool.shift()!;
    let guard = 0;
    while (key(current[0]) !== key(current[current.length - 1]) && guard++ < 100000) {
      const tail = key(current[current.length - 1]);
      const idx = pool.findIndex((s) => key(s[0]) === tail || key(s[s.length - 1]) === tail);
      if (idx === -1) break;
      let next = pool.splice(idx, 1)[0];
      if (key(next[0]) !== tail) next = [...next].reverse();
      current = current.concat(next.slice(1));
    }
    if (current.length >= 4 && key(current[0]) === key(current[current.length - 1])) {
      rings.push(current);
    }
  }
  return rings;
}

export function pointInRing(pt: Position, ring: Ring): boolean {
  const [x, y] = pt;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function polygons(area: Area): Ring[][] {
  return area.type === "Polygon" ? [area.coordinates] : area.coordinates;
}

export function pointInArea(pt: Position, area: Area): boolean {
  return polygons(area).some(
    ([outer, ...holes]) => pointInRing(pt, outer) && !holes.some((h) => pointInRing(pt, h)),
  );
}

/** Construye un área a partir de anillos externos e internos (asigna cada hueco a su exterior). */
export function buildArea(outers: Ring[], inners: Ring[]): Area | null {
  if (!outers.length) return null;
  const polys: Ring[][] = outers.map((o) => [o]);
  for (const h of inners) {
    const owner = polys.find((p) => pointInRing(h[0], p[0]));
    if (owner) owner.push(h);
  }
  return polys.length === 1
    ? { type: "Polygon", coordinates: polys[0] }
    : { type: "MultiPolygon", coordinates: polys };
}

export function bbox(area: Area): [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const poly of polygons(area))
    for (const [x, y] of poly[0]) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  return [minX, minY, maxX, maxY];
}

function ringAreaCentroid(ring: Ring): { a: number; cx: number; cy: number } {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    a += f;
    cx += (ring[j][0] + ring[i][0]) * f;
    cy += (ring[j][1] + ring[i][1]) * f;
  }
  a /= 2;
  if (a === 0) return { a: 0, cx: ring[0][0], cy: ring[0][1] };
  return { a: Math.abs(a), cx: cx / (6 * a), cy: cy / (6 * a) };
}

/** Centroide del polígono exterior más grande, como [lng, lat]. */
export function centroid(area: Area): Position {
  const best = polygons(area)
    .map((p) => ringAreaCentroid(p[0]))
    .sort((a, b) => b.a - a.a)[0];
  return [best.cx, best.cy];
}

export function haversineKm(a: Position, b: Position): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Divide un bbox en una grilla n×n (para búsquedas de Places que topan en 60 resultados). */
export function splitBbox(
  b: [number, number, number, number],
  n: number,
): [number, number, number, number][] {
  const [minX, minY, maxX, maxY] = b;
  const dx = (maxX - minX) / n;
  const dy = (maxY - minY) / n;
  const out: [number, number, number, number][] = [];
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      out.push([minX + i * dx, minY + j * dy, minX + (i + 1) * dx, minY + (j + 1) * dy]);
  return out;
}
