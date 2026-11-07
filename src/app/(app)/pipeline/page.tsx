import { getT } from "@/lib/i18n/server";
import Link from "next/link";
import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { STAGES, whatsappLink } from "@/lib/crm";
import { Board, type BoardCard } from "./board";
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
  const boardCards: BoardCard[] = cards.map((c) => ({
    id: c.id,
    name: c.name,
    stage: c.stage,
    locality: c.locality,
    score: c.score,
    assigned: c.assigned,
    hasMessage: !!c.message,
    waHref: c.message ? whatsappLink(c.phone, c.message) : null,
  }));
  const totalMap = Object.fromEntries(totals.map((x) => [x.stage, x.n]));

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
      <p className="help" style={{ marginTop: -6 }}>{t("Arrastrá una tarjeta a otra columna para cambiar su etapa.")}</p>
      <Board stages={STAGES.map((x) => ({ key: x.key, label: x.label }))} cards={boardCards} totals={totalMap} />
    </>
  );
}
