/**
 * Datos de DEMOSTRACIÓN para probar la interfaz sin API keys.
 * Crea una región "DEMO Alicante" con sectores en grilla y prospectos ficticios ("Demo …").
 * Uso: npm run seed:demo   (no usar en la base de producción)
 */
import { importSectors } from "../lib/agents/agent1-mapper";
import { mapNextLocalities } from "../lib/agents/agent1-mapper";
import { collectData } from "../lib/agents/agent2-collector";
import { pool, q } from "../lib/db";
import type { Position } from "../lib/geo/geometry";

const NAMES = ["Centro", "Ensanche", "Playa de San Juan", "Albufereta", "San Blas", "Benalúa", "Carolinas", "Babel", "Garbinet"];

async function main() {
  const sectors = NAMES.map((name, i) => {
    const x = -0.53 + (i % 3) * 0.03;
    const y = 38.33 + Math.floor(i / 3) * 0.025;
    const ring: Position[] = [
      [x, y],
      [x + 0.03, y],
      [x + 0.03, y + 0.025],
      [x, y + 0.025],
      [x, y],
    ];
    return { name: `DEMO ${name}`, area: { type: "Polygon" as const, coordinates: [ring] } };
  });
  await importSectors("DEMO Alicante", sectors);
  let n = 0;
  const source = {
    discover: async (loc: { name: string; bbox: [number, number, number, number] | null }) => {
      const [x0, y0, x1, y1] = loc.bbox!;
      return Array.from({ length: 3 }, (_, k) => {
        n++;
        return {
          source: "google_places" as const,
          sourceId: `demo-${n}`,
          name: `Demo Hotel ${n}`,
          category: k === 0 ? "hotel" : k === 1 ? "guest_house" : "hostel",
          address: `Calle Demo ${n}, Alicante`,
          lat: y0 + ((y1 - y0) * (k + 1)) / 4,
          lng: x0 + ((x1 - x0) * (k + 1)) / 4,
          rating: 3.5 + (n % 3) * 0.5,
          reviewsCount: 40 + n * 7,
          raw: { demo: true },
        };
      });
    },
  };
  await mapNextLocalities(5, source);
  await collectData(100, () => {}, null);
  const first = await q<{ id: number }>("SELECT id FROM prospects WHERE source_id LIKE 'demo-%' ORDER BY id LIMIT 4");
  for (const p of first) {
    await q(
      `INSERT INTO reviews (prospect_id, rating, text, author) VALUES
       ($1, 5, 'Habitaciones muy limpias y el personal de recepción súper amable.', 'Demo A'),
       ($1, 2, 'Llamé tres veces para reservar y nadie contestó el teléfono.', 'Demo B'),
       ($1, 3, 'Buen desayuno, pero el check-in tardó más de 30 minutos.', 'Demo C')
       ON CONFLICT DO NOTHING`,
      [p.id],
    );
  }
  console.log("Demo cargada: 9 sectores (5 mapeados) y 15 prospectos ficticios.");
  await pool().end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
