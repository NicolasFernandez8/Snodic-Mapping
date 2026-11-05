/** Simplificación Douglas-Peucker para dibujar polígonos livianos en el mapa. */
import type { Area, Position, Ring } from "./geometry";

function perpDist(p: Position, a: Position, b: Position): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
  const x = a[0] + t * dx;
  const y = a[1] + t * dy;
  return Math.hypot(p[0] - x, p[1] - y);
}

function dp(points: Position[], tol: number): Position[] {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let max = 0;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = perpDist(points[i], points[s], points[e]);
      if (d > max) {
        max = d;
        idx = i;
      }
    }
    if (idx !== -1 && max > tol) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** Simplifica un anillo cerrado; si queda degenerado, devuelve el original. */
export function simplifyRing(ring: Ring, tol: number): Ring {
  const out = dp(ring, tol);
  return out.length >= 4 ? out : ring;
}

/** Redondea a 5 decimales (~1 m) y simplifica (tolerancia en grados, 0.0002 ≈ 20 m). */
export function simplifyArea(area: Area, tol = 0.0002): Area {
  const round = (r: Ring): Ring => r.map(([x, y]) => [Math.round(x * 1e5) / 1e5, Math.round(y * 1e5) / 1e5]);
  const poly = (rings: Ring[]) => rings.map((r) => round(simplifyRing(r, tol)));
  return area.type === "Polygon"
    ? { type: "Polygon", coordinates: poly(area.coordinates) }
    : { type: "MultiPolygon", coordinates: area.coordinates.map(poly) };
}
