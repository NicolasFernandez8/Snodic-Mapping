import Link from "next/link";
import { notFound } from "next/navigation";
import { getT } from "@/lib/i18n/server";
import { one, q } from "@/lib/db";
import { parseReport } from "@/lib/audit";
import { caseLine, listCases, matchCases } from "@/lib/cases";
import { detectPains } from "@/lib/scoring";
import { meetingQuestions } from "@/lib/extras";
import { CopyButton } from "@/app/copy-button";
import { V } from "@/app/ui";

export const dynamic = "force-dynamic";

/** Mejora del Agente 4 · Resumen de una página para la reunión (imprimible). */
export default async function Reunion({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const p = await one<{ name: string; locality: string | null; category: string | null; rating: string | null; reviews_count: number | null; website: string | null; phone: string | null; score: number | null }>(
    `SELECT p.name, l.name AS locality, p.category, p.rating, p.reviews_count, p.website, p.phone, p.score
     FROM prospects p LEFT JOIN localities l ON l.id = p.locality_id WHERE p.id = $1`,
    [id],
  );
  if (!p) notFound();
  const [reviews, report, cases] = await Promise.all([
    q<{ rating: number | null; text: string }>("SELECT rating, text FROM reviews WHERE prospect_id = $1", [id]),
    one<{ content: string }>(
      "SELECT content FROM outputs WHERE prospect_id = $1 AND kind = 'report' AND content IS NOT NULL ORDER BY created_at DESC, id DESC LIMIT 1",
      [id],
    ),
    listCases(),
  ]);
  const pains = detectPains(reviews);
  const ideas = report ? parseReport(report.content) : [];
  const match = matchCases(cases, reviews, report?.content ?? "")[0];
  const questions = meetingQuestions(pains.map((x) => x.tag));
  const plain = [
    `${p.name} · ${p.locality ?? "-"}`,
    "",
    "Problemas detectados:",
    ...(pains.length ? pains.map((x) => `- ${x.tag} (${x.count})`) : ["-"]),
    "",
    ...ideas.flatMap((i, n) => [`Idea ${n + 1}: ${i.solution}`, `Problema: ${i.problem}`, i.impact ? `Impacto: ${i.impact}` : "", ""]),
    match ? `Caso: ${caseLine(match)}` : "",
    "",
    "Preguntas:",
    ...questions.map((x, n) => `${n + 1}. ${x}`),
  ].join("\n");

  return (
    <div className="brief">
      <div className="page-head">
        <div>
          <p className="sub no-print" style={{ margin: 0 }}>
            <Link href={`/prospectos/${id}`}>{t("← Volver a la ficha")}</Link>
          </p>
          <h1>{t("Resumen para la reunión")}</h1>
          <p className="sub">{p.name} · <V v={p.locality} /> · <V v={p.category} /></p>
        </div>
        <div className="row no-print">
          <CopyButton text={plain} label={t("Copiar resumen")} />
        </div>
      </div>
      <div className="grid two">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>{t("Datos")}</h2>
          <dl className="dl">
            <dt>{t("Valoración")}</dt><dd><V v={p.rating} /> ({p.reviews_count ?? "-"})</dd>
            <dt>{t("Puntaje")}</dt><dd><V v={p.score} /></dd>
            <dt>{t("Web")}</dt><dd><V v={p.website} href /></dd>
            <dt>{t("Teléfono")}</dt><dd><V v={p.phone} /></dd>
          </dl>
          <h2>{t("Problemas detectados en reseñas")}</h2>
          {pains.length ? (
            <ul>{pains.map((x) => <li key={x.tag}><strong>{x.tag}</strong> · {x.count === 1 ? t("1 mención") : t("{n} menciones", { n: x.count })}</li>)}</ul>
          ) : (
            <p className="help">{t("Sin reseñas cargadas.")}</p>
          )}
          {match && (
            <>
              <h2>{t("Caso para mencionar")}</h2>
              <p><strong>{match.title}</strong> — {match.result ?? match.summary}</p>
            </>
          )}
        </div>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>{t("Las 2 ideas")}</h2>
          {ideas.length ? (
            <ol>
              {ideas.map((i, n) => (
                <li key={n} style={{ marginBottom: 10 }}>
                  <strong>{i.solution}</strong>
                  <div className="help">{t("Problema:")} {i.problem}</div>
                  {i.impact && <div className="help">{t("Impacto:")} {i.impact}</div>}
                </li>
              ))}
            </ol>
          ) : (
            <p className="help">{t("Falta el informe del Agente 4.")}</p>
          )}
          <h2>{t("Preguntas para hacer")}</h2>
          <ol>{questions.map((x) => <li key={x}>{x}</li>)}</ol>
        </div>
      </div>
    </div>
  );
}
