import { getT } from "@/lib/i18n/server";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { dueFollowUps, followUpMessage, whatsappLink } from "@/lib/crm";
import { getSetting, q } from "@/lib/db";
import { caseLine, listCases, matchCases } from "@/lib/cases";
import { reactivateAction, setStageAction } from "@/app/crm-actions";
import { reactivationCandidates } from "@/lib/agents/agents-plus";
import { reactivationMessage } from "@/lib/extras";
import { WhatsAppButton } from "@/app/whatsapp-button";
import { CopyButton } from "@/app/copy-button";
import { fmtDate, V } from "@/app/ui";
import { baseUrl } from "@/app/base-url";

export const dynamic = "force-dynamic";

export default async function Seguimientos({ searchParams }: { searchParams: Promise<{ mine?: string }> }) {
  const t = await getT();
  const me = await requireUser();
  const mine = (await searchParams).mine === "1";
  const [rows, max, cases, base, stale, afterDays] = await Promise.all([
    dueFollowUps(mine ? me.id : undefined),
    getSetting<number>("follow_up_max", 2),
    listCases(),
    baseUrl(),
    reactivationCandidates(),
    getSetting<number>("reactivate_after_days", 75),
  ]);
  const reviews = rows.length
    ? await q<{ prospect_id: number; rating: number | null; text: string }>(
        "SELECT prospect_id, rating, text FROM reviews WHERE prospect_id = ANY($1)",
        [rows.map((r) => r.id)],
      )
    : [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t("Seguimientos de hoy")}</h1>
          <p className="sub">{t("Contactados que no respondieron. Máximo {n} seguimientos por prospecto.", { n: max })}</p>
        </div>
        <div className="row">
          <Link className={`btn ${mine ? "secondary" : ""} sm`} href="/seguimientos">{t("Todos")}</Link>
          <Link className={`btn ${mine ? "" : "secondary"} sm`} href="/seguimientos?mine=1">{t("Míos")}</Link>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="card empty">{t("No hay seguimientos pendientes. 🎉")}</div>
      ) : (
        <div className="grid two">
          {rows.map((r) => {
            const match = matchCases(cases, reviews.filter((x) => x.prospect_id === r.id))[0];
            const auditUrl = r.audit_slug ? `${base}/a/${r.audit_slug}` : null;
            const msg = followUpMessage(r.follow_ups_sent + 1, auditUrl, match ? caseLine(match) : null);
            return (
              <div key={r.id} className="card">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <Link href={`/prospectos/${r.id}`}><strong>{r.name}</strong></Link>
                  <span className="badge warn">{t("Seguimiento {a}/{b}", { a: r.follow_ups_sent + 1, b: max })}</span>
                </div>
                <p className="help">
                  <V v={r.locality} />{" "}{t("· contactado")}{" "}{fmtDate(r.contacted_at)} · {r.assigned ?? t("sin asignar")}
                  {match && <>{" "}{t("· caso sugerido:")}{" "}<strong>{match.title}</strong></>}
                </p>
                <div className="pre">{msg}</div>
                <div className="row" style={{ marginTop: 10 }}>
                  <WhatsAppButton prospectId={r.id} href={whatsappLink(r.phone, msg)} kind="follow_up" label={t("Enviar seguimiento")} />
                  <CopyButton text={msg} />
                  <form action={setStageAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="stage" value="replied" />
                    <button className="btn secondary sm">{t("Respondió")}</button>
                  </form>
                  <form action={setStageAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="stage" value="lost" />
                    <button className="btn danger sm">{t("Descartar")}</button>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="page-head" id="reactivar" style={{ marginTop: 28 }}>
        <div>
          <h1 style={{ fontSize: 20 }}>{t("Reactivar")}</h1>
          <p className="sub">{t("Agente 11 · sin respuesta hace más de {n} días. Nuevo intento con otro enfoque (respeta la lista de no contactar).", { n: afterDays })}</p>
        </div>
      </div>
      {stale.length === 0 ? (
        <div className="card empty">{t("Nadie para reactivar por ahora.")}</div>
      ) : (
        <div className="grid two">
          {stale.map((r) => {
            const msg = reactivationMessage(r.pains?.[0] ?? null);
            return (
              <div key={r.id} className="card">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <Link href={`/prospectos/${r.id}`}><strong>{r.name}</strong></Link>
                  <span className="badge muted">{fmtDate(r.last)}</span>
                </div>
                <p className="help"><V v={r.locality} />{r.pains?.length ? ` · ${r.pains.join(", ")}` : ""}</p>
                <div className="pre">{msg}</div>
                <div className="row" style={{ marginTop: 10 }}>
                  <CopyButton text={msg} />
                  <form action={reactivateAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <button className="btn sm">{t("Reactivar")}</button>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
