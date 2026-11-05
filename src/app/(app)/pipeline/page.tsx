import { getT } from "@/lib/i18n/server";
import Link from "next/link";
import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { STAGES, whatsappLink } from "@/lib/crm";
import { setStageAction } from "@/app/crm-actions";
import { WhatsAppButton } from "@/app/whatsapp-button";
import { V } from "@/app/ui";
import { FilterBar } from "../filter-bar";
import { filterSql, parseFilters } from "@/lib/filters";

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

export default async function Pipeline({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const t = await getT();
  const me = await requireUser();
  const sp = await searchParams;
  const filters = parseFilters({ ...sp, owner: sp.owner ?? (sp.mine === "1" ? "me" : undefined) });
  delete filters.stage;
  const mine = filters.owner === "me";
  const fparams: unknown[] = [];
  const extra = filterSql(filters, fparams, me.id);
  const filter = `p.status <> 'discarded' AND p.duplicate_of IS NULL ${extra.length ? "AND " + extra.join(" AND ") : ""}`;
  const [cards, totals] = await Promise.all([
    q<Card>(
      `WITH ranked AS (
         SELECT p.id, p.name, p.stage, p.locality_id, p.phone, p.score, p.assigned_to, p.follow_ups_sent,
                row_number() OVER (PARTITION BY p.stage ORDER BY p.score DESC NULLS LAST, p.id) AS rn
         FROM prospects p LEFT JOIN localities l ON l.id = p.locality_id WHERE ${filter})
       SELECT r.id, r.name, r.stage, l.name AS locality, r.phone, r.score, u.username AS assigned, r.follow_ups_sent,
              CASE WHEN r.stage = 'to_contact' THEN m.content END AS message
       FROM ranked r
       LEFT JOIN localities l ON l.id = r.locality_id
       LEFT JOIN users u ON u.id = r.assigned_to
       LEFT JOIN LATERAL (SELECT content FROM outputs o WHERE o.prospect_id = r.id AND o.kind = 'message'
                          AND o.content IS NOT NULL AND r.stage = 'to_contact'
                          ORDER BY o.created_at DESC, o.id DESC LIMIT 1) m ON true
       WHERE r.rn <= 60
       ORDER BY r.score DESC NULLS LAST, r.id`,
      fparams,
    ),
    q<{ stage: string; n: number }>(
      `SELECT p.stage, count(*)::int AS n FROM prospects p LEFT JOIN localities l ON l.id = p.locality_id WHERE ${filter} GROUP BY p.stage`,
      fparams,
    ),
  ]);
  const by = (s: string) => cards.filter((c) => c.stage === s);
  const totalOf = (s: string) => totals.find((x) => x.stage === s)?.n ?? 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t("Pipeline de captación")}</h1>
          <p className="sub">{t("Ordenado por puntaje: arriba los que conviene contactar primero.")}</p>
        </div>
        <div className="row">
          <Link className={`btn ${mine ? "secondary" : ""} sm`} href="/pipeline">{t("Todos")}</Link>
          <Link className={`btn ${mine ? "" : "secondary"} sm`} href="/pipeline?owner=me">{t("Mis prospectos")}</Link>
        </div>
      </div>
      <FilterBar path="/pipeline" filters={filters} show={{ stage: false }} />
      <div className="kanban">
        {STAGES.map((s) => {
          const list = by(s.key);
          return (
            <section key={s.key} className="kanban-col">
              <header>
                <strong>{t(s.label)}</strong>
                <span className="badge muted">{totalOf(s.key)}</span>
              </header>
              {list.map((c) => (
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
              {totalOf(s.key) > list.length && <div className="help">{t("+{n} más en Prospectos", { n: totalOf(s.key) - list.length })}</div>}
            </section>
          );
        })}
      </div>
    </>
  );
}
