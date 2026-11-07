"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Feature } from "geojson";
import { useT } from "@/lib/i18n/client";

/**
 * Filtro visual del mapa: regiones → localidades, estados, búsqueda y "solo con prospectos".
 * Filtra en el navegador (sin pedir datos de nuevo) y recuerda la selección en este dispositivo.
 * Se guardan las localidades OCULTAS: lo que se importe después aparece visible por defecto.
 */
const KEY = "snodic_map_filter_v1";
export const STATUSES = [
  ["mapped", "Mapeada", "#c2337f"],
  ["mapping", "Mapeando", "#d98a00"],
  ["partial", "Parcial", "#e58fb8"],
  ["pending", "Pendiente", "#8a9ab3"],
  ["failed", "Error", "#d93a3a"],
  ["skipped", "Omitida", "#c0c7d2"],
] as const;

type Saved = { hidden: number[]; statuses: string[]; onlyWithProspects: boolean };
const load = (): Saved | null => {
  try {
    const v = localStorage.getItem(KEY);
    return v ? (JSON.parse(v) as Saved) : null;
  } catch {
    return null;
  }
};

export function useMapFilter(features: Feature[]) {
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [statuses, setStatuses] = useState<Set<string>>(new Set(STATUSES.map((s) => s[0])));
  const [onlyWithProspects, setOnly] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const s = load();
    if (s) {
      setHidden(new Set(s.hidden));
      setStatuses(new Set(s.statuses));
      setOnly(s.onlyWithProspects);
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ hidden: [...hidden], statuses: [...statuses], onlyWithProspects }));
    } catch {}
  }, [hidden, statuses, onlyWithProspects, ready]);

  const visible = useCallback(
    (f: Feature) => {
      const p = f.properties ?? {};
      return !hidden.has(p.id) && statuses.has(p.status) && (!onlyWithProspects || (p.prospects ?? 0) > 0);
    },
    [hidden, statuses, onlyWithProspects],
  );
  const setMany = (ids: number[], show: boolean) =>
    setHidden((h) => {
      const n = new Set(h);
      for (const id of ids) show ? n.delete(id) : n.add(id);
      return n;
    });
  const toggleStatus = (s: string) =>
    setStatuses((cur) => {
      const n = new Set(cur);
      n.has(s) ? n.delete(s) : n.add(s);
      return n;
    });
  const allVisible = hidden.size === 0 && statuses.size === STATUSES.length && !onlyWithProspects;
  const key = `${hidden.size}:${[...hidden].join(",")}|${[...statuses].join(",")}|${onlyWithProspects}`;
  const reset = () => {
    setHidden(new Set());
    setStatuses(new Set(STATUSES.map((s) => s[0])));
    setOnly(false);
  };
  // `features` se usa para que el hook se recalcule cuando llegan datos nuevos.
  void features;
  return { hidden, statuses, onlyWithProspects, setOnly, setMany, toggleStatus, visible, allVisible, key, reset };
}

type Filter = ReturnType<typeof useMapFilter>;

export function MapFilter({
  filter,
  features,
  shownCount,
  pointCount,
  onFocus,
}: {
  filter: Filter;
  features: Feature[];
  shownCount: number;
  pointCount: number;
  onFocus: (f: Feature[]) => void;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<number>>(new Set());
  const regions = useMemo(() => {
    const m = new Map<number, { id: number; name: string; items: Feature[] }>();
    for (const f of features) {
      const p = f.properties ?? {};
      const r = m.get(p.region_id) ?? { id: p.region_id as number, name: String(p.region ?? "-"), items: [] as Feature[] };
      r.items.push(f);
      m.set(p.region_id, r);
    }
    return [...m.values()];
  }, [features]);
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const qn = norm(query.trim());
  const ids = (fs: Feature[]) => fs.map((f) => f.properties?.id as number);
  const toggleOpen = (id: number) =>
    setOpen((o) => {
      const n = new Set(o);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  return (
    <aside className="map-filter" aria-label={t("Filtros del mapa")}>
      <div className="mf-head">
        <strong>{t("Qué ver")}</strong>
        <span className="help" style={{ margin: 0 }}>{t("{a} zonas · {b} prospectos", { a: shownCount, b: pointCount })}</span>
      </div>
      <input type="search" placeholder={t("Buscar localidad…")} value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="row" style={{ gap: 6 }}>
        <button type="button" className="btn secondary sm" onClick={() => filter.setMany(ids(features), true)}>{t("Todas")}</button>
        <button type="button" className="btn secondary sm" onClick={() => filter.setMany(ids(features), false)}>{t("Ninguna")}</button>
        <button type="button" className="btn secondary sm" onClick={() => onFocus(features.filter(filter.visible))}>{t("Encuadrar")}</button>
        {!filter.allVisible && (
          <button type="button" className="btn secondary sm" onClick={filter.reset}>{t("Restablecer")}</button>
        )}
      </div>

      <div className="mf-chips">
        {STATUSES.map(([k, label, color]) => (
          <button
            key={k}
            type="button"
            className={`mf-chip ${filter.statuses.has(k) ? "on" : ""}`}
            aria-pressed={filter.statuses.has(k)}
            onClick={() => filter.toggleStatus(k)}
          >
            <i style={{ background: color }} />
            {t(label)}
          </button>
        ))}
      </div>
      <label className="mf-row mf-check">
        <input type="checkbox" checked={filter.onlyWithProspects} onChange={(e) => filter.setOnly(e.target.checked)} /> {t("Solo con prospectos")}
      </label>

      <div className="mf-list">
        {regions.length === 0 && <p className="help">{t("Todavía no hay regiones importadas.")}</p>}
        {regions.map((r) => {
          const items = qn ? r.items.filter((f) => norm(String(f.properties?.name)).includes(qn)) : r.items;
          if (!items.length) return null;
          const on = r.items.filter((f) => !filter.hidden.has(f.properties?.id)).length;
          const expanded = open.has(r.id) || !!qn || regions.length === 1;
          return (
            <div key={r.id} className="mf-region">
              <div className="mf-row">
                <input
                  type="checkbox"
                  aria-label={r.name}
                  checked={on === r.items.length}
                  ref={(el) => {
                    if (el) el.indeterminate = on > 0 && on < r.items.length;
                  }}
                  onChange={(e) => filter.setMany(ids(r.items), e.target.checked)}
                />
                <button type="button" className="mf-name" onClick={() => toggleOpen(r.id)} aria-expanded={expanded}>
                  <span className="mf-caret">{expanded ? "▾" : "▸"}</span> <strong>{r.name}</strong>
                  <span className="help" style={{ margin: 0 }}> {on}/{r.items.length}</span>
                </button>
                <button type="button" className="mf-go" title={t("Ver en el mapa")} onClick={() => onFocus(r.items)}>⌖</button>
              </div>
              {expanded && (
                <div className="mf-locs">
                  {items.map((f) => {
                    const p = f.properties ?? {};
                    const color = STATUSES.find((s) => s[0] === p.status)?.[2] ?? "#8a9ab3";
                    return (
                      <div key={p.id} className={`mf-row ${filter.statuses.has(p.status) ? "" : "mf-off"}`}>
                        <input
                          type="checkbox"
                          aria-label={p.name}
                          checked={!filter.hidden.has(p.id)}
                          onChange={(e) => filter.setMany([p.id], e.target.checked)}
                        />
                        <i className="mf-dot" style={{ background: color }} />
                        <button
                          type="button"
                          className="mf-name"
                          title={t("Mostrar solo esta")}
                          onClick={() => {
                            filter.setMany(ids(features), false);
                            filter.setMany([p.id], true);
                            if (!filter.statuses.has(p.status)) filter.toggleStatus(p.status);
                            if (filter.onlyWithProspects && !p.prospects) filter.setOnly(false);
                            onFocus([f]);
                          }}
                        >
                          {p.name}
                        </button>
                        <span className="help mf-count">{p.prospects ?? 0}</span>
                        <button type="button" className="mf-go" title={t("Ver en el mapa")} onClick={() => onFocus([f])}>⌖</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {!filter.allVisible && shownCount > 0 && (
        <a className="btn secondary sm" href={`/api/export/kml?ids=${features.filter(filter.visible).map((f) => f.properties?.id).join(",")}`}>
          {t("⬇ KML de lo visible")}
        </a>
      )}
      <p className="help" style={{ margin: 0 }}>{t("Tildá o destildá para mostrar u ocultar. Clic en el nombre: ver solo esa localidad.")}</p>
    </aside>
  );
}
