import { getT } from "@/lib/i18n/server";
import Link from "next/link";
import { q } from "@/lib/db";
import { bulkAction, importCsvAction } from "@/app/feature-actions";
import { requireUser } from "@/lib/auth/session";
import { filterSql, filtersToQuery, parseFilters } from "@/lib/filters";
import { FilterBar } from "../filter-bar";
import { STAGES, STAGE_LABEL, type Stage } from "@/lib/crm";
import { Badge, V } from "@/app/ui";

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;

export default async function Prospectos({ searchParams }: { searchParams: Promise<Search> }) {
  const t = await getT();
  const sp = await searchParams;
  const me = await requireUser();
  const one1 = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : (sp[k] as string | undefined));
  const page = Math.max(1, Number(one1("page") ?? 1));
  const sort = one1("sort");
  // compatibilidad con links viejos: ?s= y ?mine=1
  const filters = parseFilters({ ...sp, q: sp.q ?? sp.s, owner: sp.owner ?? (one1("mine") === "1" ? "me" : undefined) });
  const params: unknown[] = [];
  const where = filterSql(filters, params, me.id);
  if (!filters.status) where.push("p.status <> 'discarded'");
  where.push("p.duplicate_of IS NULL");
  const w = `WHERE ${where.join(" AND ")}`;
  const users = await q<{ id: number; username: string }>("SELECT id, username FROM users ORDER BY username");
  const [rows, total] = await Promise.all([
    q<{
      id: number;
      name: string;
      category: string | null;
      locality: string | null;
      phone: string | null;
      website: string | null;
      rating: string | null;
      reviews_count: number | null;
      status: string;
      notion_page_id: string | null;
      stage: Stage;
      score: number | null;
      assigned: string | null;
    }>(
      `SELECT p.id, p.name, p.category, l.name AS locality, p.phone, p.website, p.rating, p.reviews_count, p.status,
              p.notion_page_id, p.stage, p.score, u.username AS assigned
       FROM prospects p LEFT JOIN localities l ON l.id = p.locality_id LEFT JOIN users u ON u.id = p.assigned_to ${w}
       ORDER BY ${sort === "recent" ? "p.created_at DESC" : "p.score DESC NULLS LAST"}, p.id DESC
       LIMIT 50 OFFSET ${(page - 1) * 50}`,
      params,
    ),
    q<{ n: number }>(`SELECT count(*)::int AS n FROM prospects p LEFT JOIN localities l ON l.id = p.locality_id ${w}`, params),
  ]);
  const n = total[0]?.n ?? 0;
  const qs = (o: Record<string, string>) =>
    "?" + [filtersToQuery(filters), new URLSearchParams({ ...(sort ? { sort } : {}), ...o }).toString()].filter(Boolean).join("&");

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t("Prospectos")}</h1>
          <p className="sub">{t("{n} resultados", { n })}</p>
        </div>
        <div className="row">
          <a className="btn secondary" href="/api/export/csv">{t("⬇ Exportar CSV")}</a>
          <details className="import-csv">
            <summary className="btn secondary">{t("⬆ Importar CSV")}</summary>
            <form action={importCsvAction} className="card" style={{ position: "absolute", right: 0, zIndex: 10, width: 340 }}>
              <input type="file" name="csv" accept=".csv,text/csv" required />
              <p className="help">
                {t("Columnas: Name (obligatoria), Phone, Address, Webpage, Email, Category, Location, Instagram, Facebook, URL Google Maps, Latitude, Longitude. Se saltean duplicados y los de “no contactar”.")}
              </p>
              <button className="btn sm">{t("Importar")}</button>
            </form>
          </details>
        </div>
      </div>
      {one1("imported") !== undefined && (
        <div className="notice" style={{ borderColor: "var(--ok)" }}>
          {t("Importados: {n}. Salteados (duplicados o vacíos): {s}.", { n: one1("imported") ?? 0, s: one1("skipped") ?? 0 })}
        </div>
      )}

      <FilterBar path="/prospectos" filters={filters} show={{ status: true }} hidden={sort ? { sort } : {}} />
      <div className="row" style={{ justifyContent: "flex-end", marginTop: -8, marginBottom: 8 }}>
        <Link className={`chip ${sort === "recent" ? "" : "on"}`} href={`/prospectos?${filtersToQuery(filters)}`}>{t("Mayor puntaje primero")}</Link>
        <Link className={`chip ${sort === "recent" ? "on" : ""}`} href={`/prospectos?${[filtersToQuery(filters), "sort=recent"].filter(Boolean).join("&")}`}>{t("Más recientes")}</Link>
      </div>

      <form id="bulk" action={bulkAction} className="row bulk-bar">
        <span className="help">{t("Con los seleccionados:")}</span>
        <select name="bulk" defaultValue="" style={{ width: "auto" }} required>
          <option value="" disabled>{t("Elegir acción…")}</option>
          <optgroup label={t("Asignar a")}>
            <option value="assign:">{t("Sin asignar")}</option>
            {users.map((u) => (
              <option key={u.id} value={`assign:${u.id}`}>{u.username}</option>
            ))}
          </optgroup>
          <optgroup label={t("Mover a etapa")}>
            {STAGES.map((s) => (
              <option key={s.key} value={`stage:${s.key}`}>{t(s.label)}</option>
            ))}
          </optgroup>
          <option value="discard">{t("Descartar")}</option>
        </select>
        <button className="btn secondary sm">{t("Aplicar")}</button>
      </form>
      <div className="card table-wrap" style={{ padding: 0 }}>
        {rows.length === 0 ? (
          <div className="empty">{t("No hay prospectos con estos filtros.")}</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ width: 28 }}></th><th>{t("Puntaje")}</th><th>{t("Nombre")}</th><th>{t("Localidad")}</th><th>{t("Categoría")}</th><th>{t("Teléfono")}</th><th>{t("Etapa")}</th><th>{t("Responsable")}</th><th>{t("Agentes")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><input type="checkbox" name="ids" value={r.id} form="bulk" aria-label={r.name} style={{ width: "auto" }} /></td>
                  <td>
                    {r.score !== null ? (
                      <span className={`badge ${r.score >= 60 ? "ok" : r.score >= 35 ? "warn" : "muted"}`}>{r.score}</span>
                    ) : (
                      <V v={null} />
                    )}
                  </td>
                  <td><Link href={`/prospectos/${r.id}`}><strong>{r.name}</strong></Link></td>
                  <td><V v={r.locality} /></td>
                  <td><V v={r.category} /></td>
                  <td><V v={r.phone} /></td>
                  <td>{t(STAGE_LABEL[r.stage])}</td>
                  <td><V v={r.assigned} /></td>
                  <td><Badge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {n > 50 && (
        <div className="row" style={{ marginTop: 12, justifyContent: "flex-end" }}>
          {page > 1 && <Link className="btn secondary sm" href={qs({ page: String(page - 1) })}>{t("← Anterior")}</Link>}
          <span className="sub">{t("Página {p} de {n}", { p: page, n: Math.ceil(n / 50) })}</span>
          {page * 50 < n && <Link className="btn secondary sm" href={qs({ page: String(page + 1) })}>{t("Siguiente →")}</Link>}
        </div>
      )}
    </>
  );
}
