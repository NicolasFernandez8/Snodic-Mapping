import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { STAGES } from "@/lib/crm";
import { filterOptions, filtersToQuery, isEmpty, listSearches, type Filters } from "@/lib/filters";
import { deleteSearchAction, saveSearchAction } from "@/app/feature-actions";

/**
 * Barra de filtros reutilizable (Prospectos, Revisión rápida, Lote, Pipeline).
 * Es un formulario GET: los filtros quedan en la URL y se pueden guardar como búsqueda.
 */
export async function FilterBar({
  path,
  filters,
  hidden = {},
  show = {},
}: {
  path: string;
  filters: Filters;
  hidden?: Record<string, string>;
  show?: { stage?: boolean; status?: boolean };
}) {
  const t = await getT();
  const [opts, searches] = await Promise.all([filterOptions(), listSearches()]);
  const q = filtersToQuery(filters);
  const extra = new URLSearchParams(hidden).toString();
  const href = (fq: string) => `${path}?${[fq, extra].filter(Boolean).join("&")}`;
  const has = (k: string) => (filters.has ?? []).includes(k as never);
  const advanced = Object.keys(filters).some((k) => !["q", "stage", "status"].includes(k));

  return (
    <div className="card filter-bar" style={{ marginBottom: 16 }}>
      {searches.length > 0 && (
        <div className="row" style={{ marginBottom: 10 }}>
          <span className="help">{t("Búsquedas guardadas:")}</span>
          {searches.map((s) => {
            const sq = filtersToQuery(s.filters);
            return (
              <Link key={s.id} href={href(sq)} className={`chip ${sq === q && q ? "on" : ""}`} title={s.owner ?? ""}>
                {s.name}
              </Link>
            );
          })}
        </div>
      )}
      <form method="get" action={path}>
        {Object.entries(hidden).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <div className="row">
          <input name="q" placeholder={t("Buscar por nombre o dirección")} defaultValue={filters.q} style={{ flex: "2 1 220px" }} />
          {show.stage !== false && (
            <select name="stage" defaultValue={filters.stage ?? ""} style={{ flex: "1 1 150px" }}>
              <option value="">{t("Todas las etapas")}</option>
              {STAGES.map((s) => (
                <option key={s.key} value={s.key}>{t(s.label)}</option>
              ))}
            </select>
          )}
          {show.status && (
            <select name="status" defaultValue={filters.status ?? ""} style={{ flex: "1 1 150px" }}>
              <option value="">{t("Todos los estados")}</option>
              <option value="new">{t("Nuevo")}</option>
              <option value="enriched">{t("Datos listos")}</option>
              <option value="message_ready">{t("Mensaje listo")}</option>
              <option value="report_ready">{t("Informe listo")}</option>
              <option value="synced">{t("En Notion")}</option>
              <option value="discarded">{t("Descartado")}</option>
            </select>
          )}
          <button className="btn">{t("Filtrar")}</button>
          {!isEmpty(filters) && (
            <Link className="btn secondary" href={href("")}>{t("Limpiar")}</Link>
          )}
        </div>

        <details open={advanced} style={{ marginTop: 10 }}>
          <summary>{t("Filtros avanzados")}</summary>
          <div className="filter-grid">
            <fieldset>
              <legend>{t("Zona")}</legend>
              <select name="region" defaultValue={filters.region ?? ""}>
                <option value="">{t("Todas las regiones")}</option>
                {opts.regions.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              <select name="locality" defaultValue={filters.locality ?? ""}>
                <option value="">{t("Todas las localidades")}</option>
                {opts.localities.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
              <label>{t("Hasta (km del centro)")}<input name="maxKm" type="number" min={0} step={1} defaultValue={filters.maxKm} /></label>
            </fieldset>

            <fieldset>
              <legend>{t("Tipo de negocio")}</legend>
              <select name="cat" multiple defaultValue={filters.cat ?? []} size={Math.min(5, Math.max(3, opts.cats.length))}>
                {opts.cats.map((c) => (
                  <option key={c.v} value={c.v}>{c.v} ({c.n})</option>
                ))}
              </select>
              <span className="help">{t("Ctrl/⌘ + clic para elegir varias")}</span>
              <div className="row">
                <label>{t("Estrellas mín.")}<input name="minStars" type="number" min={1} max={5} defaultValue={filters.minStars} /></label>
                <label>{t("máx.")}<input name="maxStars" type="number" min={1} max={5} defaultValue={filters.maxStars} /></label>
              </div>
              <select name="chain" defaultValue={filters.chain ?? ""}>
                <option value="">{t("Independientes y cadenas")}</option>
                <option value="independent">{t("Solo independientes")}</option>
                <option value="chain">{t("Solo cadenas")}</option>
              </select>
            </fieldset>

            <fieldset>
              <legend>{t("Contacto disponible")}</legend>
              {(
                [
                  ["phone", "Teléfono"],
                  ["website", "Web"],
                  ["email", "Email"],
                  ["social", "Instagram o Facebook"],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="check">
                  <input type="checkbox" name="has" value={k} defaultChecked={has(k)} /> {t(label)}
                </label>
              ))}
            </fieldset>

            <fieldset>
              <legend>{t("Problemas en reseñas")}</legend>
              {opts.pains.length === 0 ? (
                <p className="help">{t("Aparecen cuando cargás reseñas.")}</p>
              ) : (
                opts.pains.map((p) => (
                  <label key={p.v} className="check">
                    <input type="checkbox" name="pain" value={p.v} defaultChecked={(filters.pain ?? []).includes(p.v)} /> {p.v} ({p.n})
                  </label>
                ))
              )}
            </fieldset>

            <fieldset>
              <legend>{t("Calidad")}</legend>
              <div className="row">
                <label>{t("Rating mín.")}<input name="minRating" type="number" min={0} max={5} step={0.1} defaultValue={filters.minRating} /></label>
                <label>{t("máx.")}<input name="maxRating" type="number" min={0} max={5} step={0.1} defaultValue={filters.maxRating} /></label>
              </div>
              <label>{t("Reseñas mín.")}<input name="minReviews" type="number" min={0} defaultValue={filters.minReviews} /></label>
              <label>{t("Puntaje mín.")}<input name="minScore" type="number" min={0} max={100} defaultValue={filters.minScore} /></label>
            </fieldset>

            <fieldset>
              <legend>{t("Estado")}</legend>
              <label className="check">
                <input type="checkbox" name="notContacted" value="1" defaultChecked={filters.notContacted} /> {t("Sin contactar todavía")}
              </label>
              <label className="check">
                <input type="checkbox" name="withMessage" value="1" defaultChecked={filters.withMessage} /> {t("Con mensaje listo")}
              </label>
              <select name="owner" defaultValue={filters.owner === undefined ? "" : String(filters.owner)}>
                <option value="">{t("Cualquier responsable")}</option>
                <option value="me">{t("Míos")}</option>
                <option value="none">{t("Sin asignar")}</option>
                {opts.users.map((u) => (
                  <option key={u.id} value={u.id}>{u.username}</option>
                ))}
              </select>
            </fieldset>
          </div>
          <p className="help">{t("Las estrellas y la cadena dependen de lo que tenga OpenStreetMap; el rating y los problemas, de las reseñas cargadas.")}</p>
        </details>
      </form>

      {!isEmpty(filters) && (
        <form action={saveSearchAction} className="row" style={{ marginTop: 10 }}>
          <input type="hidden" name="query" value={q} />
          <input type="hidden" name="back" value={href(q)} />
          <input name="name" placeholder={t("Nombre de la búsqueda")} required style={{ flex: "1 1 220px" }} />
          <button className="btn secondary sm">{t("Guardar búsqueda")}</button>
        </form>
      )}
      {searches.some((s) => filtersToQuery(s.filters) === q && q) && (
        <form action={deleteSearchAction} style={{ marginTop: 6 }}>
          <input type="hidden" name="id" value={searches.find((s) => filtersToQuery(s.filters) === q)!.id} />
          <input type="hidden" name="back" value={href("")} />
          <button className="btn danger sm">{t("Borrar esta búsqueda guardada")}</button>
        </form>
      )}
    </div>
  );
}
