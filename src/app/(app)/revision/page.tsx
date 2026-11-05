import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { one } from "@/lib/db";
import { whatsappLink } from "@/lib/crm";
import { saveOutputAction } from "@/app/actions";
import { blockAction, reviewDiscardAction } from "@/app/feature-actions";
import { WhatsAppButton } from "@/app/whatsapp-button";
import { V } from "@/app/ui";
import { Shortcuts } from "./shortcuts";

export const dynamic = "force-dynamic";

/** Modo revisión rápida: un prospecto por vez, listo para contactar, del mejor puntaje al peor. */
export default async function Revision({ searchParams }: { searchParams: Promise<{ skip?: string }> }) {
  const t = await getT();
  const skip = ((await searchParams).skip ?? "")
    .split(",")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
  const base = `p.stage = 'to_contact' AND p.status <> 'discarded' AND NOT p.do_not_contact AND p.duplicate_of IS NULL
    AND EXISTS (SELECT 1 FROM outputs o WHERE o.prospect_id = p.id AND o.kind = 'message' AND o.content IS NOT NULL)`;
  const [p, left] = await Promise.all([
    one<{
      id: number;
      name: string;
      phone: string | null;
      score: number | null;
      locality: string | null;
      category: string | null;
      rating: string | null;
      google_maps_url: string | null;
      message: string;
      report: string | null;
    }>(
      `SELECT p.id, p.name, p.phone, p.score, l.name AS locality, p.category, p.rating, p.google_maps_url,
         (SELECT content FROM outputs o WHERE o.prospect_id = p.id AND o.kind = 'message' AND o.content IS NOT NULL ORDER BY created_at DESC, id DESC LIMIT 1) AS message,
         (SELECT content FROM outputs o WHERE o.prospect_id = p.id AND o.kind = 'report' AND o.content IS NOT NULL ORDER BY created_at DESC, id DESC LIMIT 1) AS report
       FROM prospects p LEFT JOIN localities l ON l.id = p.locality_id
       WHERE ${base} AND NOT (p.id = ANY($1::int[]))
       ORDER BY p.score DESC NULLS LAST, p.id LIMIT 1`,
      [skip],
    ),
    one<{ n: number }>(`SELECT count(*)::int AS n FROM prospects p WHERE ${base} AND NOT (p.id = ANY($1::int[]))`, [skip]),
  ]);

  if (!p)
    return (
      <>
        <div className="page-head"><h1>{t("Revisión rápida")}</h1></div>
        <div className="card empty">
          {t("No quedan prospectos listos para contactar.")}{" "}
          {skip.length > 0 && <Link href="/revision">{t("Volver a ver los salteados")}</Link>}
        </div>
      </>
    );

  const nextSkip = [...skip, p.id].join(",");
  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t("Revisión rápida")}</h1>
          <p className="sub">{t("Quedan {n} listos para contactar. Atajos: W = WhatsApp · S = saltar · D = descartar · E = editar", { n: left?.n ?? 0 })}</p>
        </div>
      </div>
      <Shortcuts />
      <div className="grid two">
        <div className="card">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 style={{ margin: 0 }}>
              <Link href={`/prospectos/${p.id}`}>{p.name}</Link>
            </h2>
            {p.score !== null && <span className={`badge ${p.score >= 60 ? "ok" : p.score >= 35 ? "warn" : "muted"}`}>{p.score}</span>}
          </div>
          <p className="help">
            <V v={p.locality} /> · <V v={p.category} /> · {p.rating ? `${p.rating}★` : "-"} · <V v={p.phone} />
            {p.google_maps_url && (
              <>
                {" · "}
                <a href={p.google_maps_url} target="_blank" rel="noreferrer">Google Maps ↗</a>
              </>
            )}
          </p>
          <form action={saveOutputAction}>
            <input type="hidden" name="id" value={p.id} />
            <input type="hidden" name="kind" value="message" />
            <textarea id="rv-text" name="content" defaultValue={p.message} rows={11} />
            <div className="row" style={{ marginTop: 10 }}>
              <span id="rv-wa">
                <WhatsAppButton prospectId={p.id} href={whatsappLink(p.phone, p.message)} kind="first" label={t("WhatsApp (W)")} />
              </span>
              <button className="btn secondary sm">{t("Guardar cambios")}</button>
              <Link id="rv-skip" className="btn secondary sm" href={`/revision?skip=${nextSkip}`}>{t("Saltar (S)")}</Link>
            </div>
          </form>
          <div className="row" style={{ marginTop: 10 }}>
            <form action={reviewDiscardAction}>
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="skip" value={skip.join(",")} />
              <button id="rv-discard" className="btn danger sm">{t("Descartar (D)")}</button>
            </form>
            <form action={blockAction} className="row">
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="next" value={`/revision?skip=${skip.join(",")}`} />
              <input name="reason" placeholder={t("Motivo (opcional)")} style={{ width: 160 }} />
              <button className="btn danger sm">{t("No contactar")}</button>
            </form>
          </div>
        </div>
        <div className="card">
          <h2>{t("Informe de oportunidades (Agente 4)")}</h2>
          {p.report ? <div className="pre">{p.report}</div> : <div className="empty">{t("Sin informe todavía.")}</div>}
        </div>
      </div>
    </>
  );
}
