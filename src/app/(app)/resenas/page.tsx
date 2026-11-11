import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { requireUser } from "@/lib/auth/session";
import { one, q } from "@/lib/db";
import { aiMode } from "@/lib/ai/llm";
import { mapsSearchUrl } from "@/lib/agents/agent1-mapper";
import { saveReviewsNextAction } from "@/app/actions";
import { V } from "@/app/ui";
import { SubmitOnCtrlEnter } from "./submit-shortcut";

export const dynamic = "force-dynamic";

type Next = {
  id: number;
  name: string;
  locality: string | null;
  address: string | null;
  rating: string | null;
  reviews_count: number | null;
  google_maps_url: string | null;
  reviews_url: string | null;
  score: number | null;
};

/**
 * Cola de reseñas: un prospecto por vez. Abrís sus reseñas en Google Maps (link público),
 * copiás y pegás, y "Guardar y siguiente". Si la IA local está activa, mensaje e informe se generan solos.
 */
export default async function Resenas({ searchParams }: { searchParams: Promise<{ s?: string; ok?: string }> }) {
  await requireUser();
  const t = await getT();
  const sp = await searchParams;
  const skipped = (sp.s ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0);
  const where = `p.status NOT IN ('discarded') AND NOT p.do_not_contact AND p.duplicate_of IS NULL AND p.stage = 'to_contact'
     AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.prospect_id = p.id)`;
  const [next, left, mode, saved] = await Promise.all([
    one<Next>(
      `SELECT p.id, p.name, l.name AS locality, p.address, p.rating, p.reviews_count, p.google_maps_url, p.reviews_url, p.score
       FROM prospects p LEFT JOIN localities l ON l.id = p.locality_id
       WHERE ${where} AND NOT (p.id = ANY($1::int[]))
       ORDER BY p.score DESC NULLS LAST, p.id LIMIT 1`,
      [skipped],
    ),
    one<{ n: number }>(`SELECT count(*)::int AS n FROM prospects p WHERE ${where}`),
    aiMode(),
    sp.ok ? one<{ name: string; n: number }>("SELECT p.name, (SELECT count(*)::int FROM reviews WHERE prospect_id = p.id) AS n FROM prospects p WHERE p.id = $1", [Number(sp.ok)]) : null,
  ]);
  const maps = next ? next.reviews_url || next.google_maps_url || mapsSearchUrl(next.name, next.locality) : null;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t("Cola de reseñas")}</h1>
          <p className="sub">{t("Un negocio por vez: abrí sus reseñas, copiá y pegá, y pasá al siguiente.")}</p>
        </div>
        <span className="badge">{t("Quedan {n}", { n: left?.n ?? 0 })}</span>
      </div>
      {saved && (
        <div className="notice" style={{ borderColor: "var(--ok)" }}>
          {t("Guardadas {n} reseñas de {name}.", { n: saved.n, name: saved.name })}{" "}
          {mode === "ollama" ? t("La IA local está escribiendo el mensaje y el informe.") : t("Generá el mensaje en Prompts en lote o en la ficha.")}{" "}
          <Link href={`/prospectos/${sp.ok}`}>{t("Ver ficha")}</Link>
        </div>
      )}
      {!next ? (
        <div className="card empty">{t("No quedan prospectos por contactar sin reseñas. 🎉")}</div>
      ) : (
        <form action={saveReviewsNextAction} className="card review-queue" id="queue-form">
          <input type="hidden" name="id" value={next.id} />
          <input type="hidden" name="skip" value={skipped.join(",")} />
          <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ minWidth: 0 }}>
              <h2 style={{ margin: 0 }}><Link href={`/prospectos/${next.id}`}>{next.name}</Link></h2>
              <p className="help" style={{ margin: "4px 0 0" }}>
                <V v={next.locality} /> · <V v={next.address} /> · {next.rating ? `${next.rating}★ (${next.reviews_count ?? 0})` : "-"}
                {next.score !== null && <> · {t("Puntaje")} {next.score}</>}
              </p>
            </div>
            {maps && (
              <a className="btn" href={maps} target="_blank" rel="noreferrer">{t("Abrir reseñas en Google Maps ↗")}</a>
            )}
          </div>
          <textarea
            name="reviews"
            rows={12}
            autoFocus
            style={{ marginTop: 14 }}
            placeholder={t("Pegá acá las reseñas. Una por bloque, con una línea vacía entre reseñas. Opcional: empezar con “5★”.")}
          />
          <p className="help">{t("Tip: priorizá las reseñas de 1 a 3 estrellas, son las que muestran problemas.")}</p>
          <div className="row">
            <button className="btn" data-save>{t("Guardar y siguiente")}</button>
            <Link className="btn secondary" href={`/resenas?s=${[...skipped, next.id].slice(-300).join(",")}`}>{t("Saltar")}</Link>
            <span className="help" style={{ margin: 0 }}>{t("Ctrl + Enter para guardar")}</span>
          </div>
          <SubmitOnCtrlEnter formId="queue-form" />
        </form>
      )}
    </>
  );
}
