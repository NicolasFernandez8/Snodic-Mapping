import { getT } from "@/lib/i18n/server";
import Link from "next/link";
import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { STAGES, whatsappLink } from "@/lib/crm";
import { setStageAction } from "@/app/crm-actions";
import { WhatsAppButton } from "@/app/whatsapp-button";
import { V } from "@/app/ui";

export const dynamic = "force-dynamic";

type Card = {
  id: number;
  name: string;
  stage: string;
  locality: string | null;
  phone: string | null;
  score: number | null;
  assigned: string | null;
  follow_ups_sent: number;
  message: string | null;
};

export default async function Pipeline({ searchParams }: { searchParams: Promise<{ mine?: string; region?: string }> }) {
  const t = await getT();
  const me = await requireUser();
  const sp = await searchParams;
  const mine = sp.mine === "1";
  const cards = await q<Card>(
    `SELECT p.id, p.name, p.stage, l.name AS locality, p.phone, p.score, u.username AS assigned, p.follow_ups_sent,
       (SELECT content FROM outputs o WHERE o.prospect_id = p.id AND o.kind = 'message' AND o.content IS NOT NULL
        ORDER BY created_at DESC, id DESC LIMIT 1) AS message
     FROM prospects p LEFT JOIN localities l ON l.id = p.locality_id LEFT JOIN users u ON u.id = p.assigned_to
     WHERE p.status <> 'discarded' ${mine ? "AND (p.assigned_to = $1)" : ""}
     ORDER BY p.score DESC NULLS LAST, p.id`,
    mine ? [me.id] : [],
  );
  const by = (s: string) => cards.filter((c) => c.stage === s);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t("Pipeline de captación")}</h1>
          <p className="sub">{t("Ordenado por puntaje: arriba los que conviene contactar primero.")}</p>
        </div>
        <div className="row">
          <Link className={`btn ${mine ? "secondary" : ""} sm`} href="/pipeline">{t("Todos")}</Link>
          <Link className={`btn ${mine ? "" : "secondary"} sm`} href="/pipeline?mine=1">{t("Mis prospectos")}</Link>
        </div>
      </div>
      <div className="kanban">
        {STAGES.map((s) => {
          const list = by(s.key);
          return (
            <section key={s.key} className="kanban-col">
              <header>
                <strong>{t(s.label)}</strong>
                <span className="badge muted">{list.length}</span>
              </header>
              {list.slice(0, 60).map((c) => (
                <article key={c.id} className="kanban-card">
                  <div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
                    <Link href={`/prospectos/${c.id}`}><strong>{c.name}</strong></Link>
                    {c.score !== null && <span className={`badge ${c.score >= 60 ? "ok" : c.score >= 35 ? "warn" : "muted"}`}>{c.score}</span>}
                  </div>
                  <div className="help"><V v={c.locality} /> · {c.assigned ?? t("sin asignar")}</div>
                  {s.key === "to_contact" && c.message && (
                    <div style={{ marginTop: 6 }}>
                      <WhatsAppButton prospectId={c.id} href={whatsappLink(c.phone, c.message)} kind="first" label={t("WhatsApp")} />
                    </div>
                  )}
                  <form action={setStageAction} className="row" style={{ marginTop: 6, flexWrap: "nowrap" }}>
                    <input type="hidden" name="id" value={c.id} />
                    <select name="stage" defaultValue={c.stage} style={{ padding: "4px 6px", fontSize: 12 }}>
                      {STAGES.map((x) => (
                        <option key={x.key} value={x.key}>{t(x.label)}</option>
                      ))}
                    </select>
                    <button className="btn secondary sm">{t("Mover")}</button>
                  </form>
                </article>
              ))}
              {list.length > 60 && <div className="help">{t("+{n} más en Prospectos", { n: list.length - 60 })}</div>}
            </section>
          );
        })}
      </div>
    </>
  );
}
