import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { dueFollowUps, followUpMessage, whatsappLink } from "@/lib/crm";
import { getSetting, q } from "@/lib/db";
import { caseLine, listCases, matchCases } from "@/lib/cases";
import { setStageAction } from "@/app/crm-actions";
import { WhatsAppButton } from "@/app/whatsapp-button";
import { CopyButton } from "@/app/copy-button";
import { fmtDate, V } from "@/app/ui";
import { baseUrl } from "@/app/base-url";

export const dynamic = "force-dynamic";

export default async function Seguimientos({ searchParams }: { searchParams: Promise<{ mine?: string }> }) {
  const me = await requireUser();
  const mine = (await searchParams).mine === "1";
  const [rows, max, cases, base] = await Promise.all([
    dueFollowUps(mine ? me.id : undefined),
    getSetting<number>("follow_up_max", 2),
    listCases(),
    baseUrl(),
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
          <h1>Seguimientos de hoy</h1>
          <p className="sub">Contactados que no respondieron. Máximo {max} seguimientos por prospecto.</p>
        </div>
        <div className="row">
          <Link className={`btn ${mine ? "secondary" : ""} sm`} href="/seguimientos">Todos</Link>
          <Link className={`btn ${mine ? "" : "secondary"} sm`} href="/seguimientos?mine=1">Míos</Link>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="card empty">No hay seguimientos pendientes. 🎉</div>
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
                  <span className="badge warn">Seguimiento {r.follow_ups_sent + 1}/{max}</span>
                </div>
                <p className="help">
                  <V v={r.locality} /> · contactado {fmtDate(r.contacted_at)} · {r.assigned ?? "sin asignar"}
                  {match && <> · caso sugerido: <strong>{match.title}</strong></>}
                </p>
                <div className="pre">{msg}</div>
                <div className="row" style={{ marginTop: 10 }}>
                  <WhatsAppButton prospectId={r.id} href={whatsappLink(r.phone, msg)} kind="follow_up" label="Enviar seguimiento" />
                  <CopyButton text={msg} />
                  <form action={setStageAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="stage" value="replied" />
                    <button className="btn secondary sm">Respondió</button>
                  </form>
                  <form action={setStageAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="stage" value="lost" />
                    <button className="btn danger sm">Descartar</button>
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
