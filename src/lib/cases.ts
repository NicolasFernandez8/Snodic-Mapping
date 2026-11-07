import { q } from "./db";
import { detectPains } from "./scoring";

export type CaseStudy = {
  id: number;
  title: string;
  tags: string[];
  summary: string;
  result: string | null;
  link: string | null;
  draft?: boolean;
  prospect_id?: number | null;
};

/** Los borradores (Agente 5, al cerrar un cliente) no se sugieren hasta publicarlos. */
export async function listCases(includeDrafts = false): Promise<CaseStudy[]> {
  return q<CaseStudy>(
    `SELECT id, title, tags, summary, result, link, draft, prospect_id FROM case_studies
     ${includeDrafts ? "" : "WHERE NOT draft"} ORDER BY draft DESC, created_at DESC`,
  );
}

/** Casos cuyas etiquetas coinciden con los problemas detectados en las reseñas (más coincidencias primero). */
export function matchCases(cases: CaseStudy[], reviews: { rating: number | null; text: string }[], reportText = "") {
  const pains = new Set(detectPains(reviews).map((p) => p.tag));
  const extra = reportText.toLowerCase();
  return cases
    .map((c) => ({
      c,
      hits: c.tags.filter((t) => pains.has(t.toLowerCase()) || (t.length > 3 && extra.includes(t.toLowerCase()))).length,
    }))
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .map((x) => x.c);
}

/** Frase corta para el seguimiento: "un hotel de Benidorm a conseguir +20 % de reservas directas". */
export function caseLine(c: CaseStudy): string {
  return (c.result || c.summary).replace(/\.$/, "");
}
