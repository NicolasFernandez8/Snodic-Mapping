import Link from "next/link";
import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { STAGES, STAGE_LABEL, type Stage } from "@/lib/crm";
import { Badge, V } from "@/app/ui";

export const dynamic = "force-dynamic";

type Search = { status?: string; locality?: string; s?: string; page?: string; stage?: string; mine?: string; sort?: string };

export default async function Prospectos({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const me = await requireUser();
  const page = Math.max(1, Number(sp.page ?? 1));
  const where: string[] = [];
  const params: unknown[] = [];
  if (sp.status) {
    params.push(sp.status);
    where.push(`p.status = $${params.length}`);
  } else where.push("p.status <> 'discarded'");
  if (sp.locality) {
    params.push(Number(sp.locality));
    where.push(`p.locality_id = $${params.length}`);
  }
  if (sp.stage) {
    params.push(sp.stage);
    where.push(`p.stage = $${params.length}`);
  }
  if (sp.mine === "1") {
    params.push(me.id);
    where.push(`p.assigned_to = $${params.length}`);
  }
  if (sp.s) {
    params.push(`%${sp.s}%`);
    where.push(`(p.name ILIKE $${params.length} OR p.address ILIKE $${params.length})`);
  }
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const [rows, total, localities] = await Promise.all([
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
       ORDER BY ${sp.sort === "recent" ? "p.created_at DESC" : "p.score DESC NULLS LAST"}, p.id DESC
       LIMIT 50 OFFSET ${(page - 1) * 50}`,
      params,
    ),
    q<{ n: number }>(`SELECT count(*)::int AS n FROM prospects p ${w}`, params),
    q<{ id: number; name: string }>(
      "SELECT id, name FROM localities WHERE prospects_found > 0 ORDER BY name",
    ),
  ]);
  const n = total[0]?.n ?? 0;
  const qs = (o: Partial<Search>) =>
    "?" + new URLSearchParams(Object.entries({ ...sp, ...o }).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Prospectos</h1>
          <p className="sub">{n} resultados</p>
        </div>
        <a className="btn secondary" href="/api/export/csv">⬇ Exportar CSV</a>
      </div>

      <form className="card row" style={{ marginBottom: 16 }}>
        <div style={{ flex: "2 1 220px" }}>
          <input name="s" placeholder="Buscar por nombre o dirección" defaultValue={sp.s} />
        </div>
        <div style={{ flex: "1 1 160px" }}>
          <select name="status" defaultValue={sp.status ?? ""}>
            <option value="">Todos los estados</option>
            <option value="new">Nuevo</option>
            <option value="enriched">Datos listos</option>
            <option value="message_ready">Mensaje listo</option>
            <option value="report_ready">Informe listo</option>
            <option value="synced">En Notion</option>
            <option value="discarded">Descartado</option>
          </select>
        </div>
        <div style={{ flex: "1 1 160px" }}>
          <select name="locality" defaultValue={sp.locality ?? ""}>
            <option value="">Todas las localidades</option>
            {localities.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>
        <div style={{ flex: "1 1 150px" }}>
          <select name="stage" defaultValue={sp.stage ?? ""}>
            <option value="">Todas las etapas</option>
            {STAGES.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </div>
        <div style={{ flex: "1 1 140px" }}>
          <select name="sort" defaultValue={sp.sort ?? ""}>
            <option value="">Mayor puntaje primero</option>
            <option value="recent">Más recientes</option>
          </select>
        </div>
        <label className="row" style={{ margin: 0, fontWeight: 500 }}>
          <input type="checkbox" name="mine" value="1" defaultChecked={sp.mine === "1"} style={{ width: "auto" }} /> Míos
        </label>
        <button className="btn">Filtrar</button>
      </form>

      <div className="card table-wrap" style={{ padding: 0 }}>
        {rows.length === 0 ? (
          <div className="empty">No hay prospectos con estos filtros.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Puntaje</th><th>Nombre</th><th>Localidad</th><th>Categoría</th><th>Teléfono</th><th>Etapa</th><th>Responsable</th><th>Agentes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
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
                  <td>{STAGE_LABEL[r.stage]}</td>
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
          {page > 1 && <Link className="btn secondary sm" href={qs({ page: String(page - 1) })}>← Anterior</Link>}
          <span className="sub">Página {page} de {Math.ceil(n / 50)}</span>
          {page * 50 < n && <Link className="btn secondary sm" href={qs({ page: String(page + 1) })}>Siguiente →</Link>}
        </div>
      )}
    </>
  );
}
