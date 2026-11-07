import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { cached } from "@/lib/cache";
import { computeInsights, MIN_GROUP, MIN_TOTAL, suggestFilters } from "@/lib/insights";
import { filtersToQuery } from "@/lib/filters";
import { saveSearchAction } from "@/app/feature-actions";

const pct = (r: number) => `${Math.round(r * 100)} %`;

/** "Qué funciona": tasa de respuesta por característica y búsqueda sugerida con datos reales. */
export async function WhatWorks() {
  const t = await getT();
  const ins = await cached("insights-ui", 60, computeInsights);
  // Orden lógico: primero qué es el negocio, después cómo se contacta, calidad y por último el mensaje.
  const ORDER = ["Categoría", "Tipo", "Estrellas", "Problema", "Contacto", "Redes", "Rating", "Puntaje", "Distancia", "Variante"];
  const dims = [...new Set(ins.segments.map((s) => s.dim))].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  const sug = ins.enough ? suggestFilters(ins) : null;
  const sq = sug ? filtersToQuery(sug.filters) : "";

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h2>{t("Qué funciona")}</h2>
      {!ins.enough ? (
        <>
          <p className="sub" style={{ marginTop: 0 }}>
            {t("Hacen falta {n} contactados para sacar conclusiones confiables. Llevás {k}.", { n: MIN_TOTAL, k: ins.total })}
          </p>
          <div className="progress" style={{ maxWidth: 420 }}>
            <div style={{ width: `${Math.min(100, (100 * ins.total) / MIN_TOTAL)}%` }} />
          </div>
          <p className="help">{t("Mientras tanto, usá el puntaje y los filtros como guía.")}</p>
        </>
      ) : (
        <>
          <p className="sub" style={{ marginTop: 0 }}>
            {t("Tasa de respuesta general: {r} ({a} de {b} contactados).", { r: pct(ins.rate), a: ins.replied, b: ins.total })}
          </p>
          {sug && Object.keys(sug.filters).length > 1 ? (
            <div className="notice" style={{ borderColor: "var(--ok)" }}>
              <strong>{t("Búsqueda sugerida")}</strong>: {sug.reasons.join(" · ")}
              <div className="row" style={{ marginTop: 8 }}>
                <Link className="btn sm" href={`/revision?${sq}`}>{t("Abrir en revisión rápida")}</Link>
                <Link className="btn secondary sm" href={`/prospectos?${sq}`}>{t("Ver en Prospectos")}</Link>
                <form action={saveSearchAction} className="row">
                  <input type="hidden" name="query" value={sq} />
                  <input type="hidden" name="name" value={t("Sugerida por resultados")} />
                  <input type="hidden" name="back" value={`/prospectos?${sq}`} />
                  <button className="btn secondary sm">{t("Guardar búsqueda")}</button>
                </form>
              </div>
            </div>
          ) : (
            <p className="help">{t("Todavía ningún grupo responde claramente mejor que el promedio.")}</p>
          )}
          <p className="help">{t("El puntaje ya suma o resta hasta 15 puntos según cómo respondieron prospectos parecidos.")}</p>
        </>
      )}

      {ins.total > 0 && (
        <div className="ww-grid">
          {dims.map((d) => {
            const rows = ins.segments.filter((s) => s.dim === d);
            return (
              <section key={d} className="ww-dim">
                <header className="ww-head">
                  <span>{t(d)}</span>
                  <span className="help">{rows.reduce((a, r) => a + r.contacted, 0)}</span>
                </header>
                {rows.map((s) => {
                  const reliable = s.contacted >= MIN_GROUP;
                  const better = reliable && s.rate >= ins.rate * 1.25;
                  return (
                    <div key={s.value} className={`ww-row ${reliable ? "" : "weak"}`}>
                      <span className="ww-label" title={t(s.value)}>{t(s.value)}</span>
                      <div className="ww-bar">
                        <div style={{ width: `${Math.max(2, Math.round(s.rate * 100))}%`, background: better ? "var(--ok)" : undefined }} />
                      </div>
                      <span className="ww-num">
                        <strong>{pct(s.rate)}</strong> <span className="help">{s.replied}/{s.contacted}</span>
                      </span>
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>
      )}
      {ins.total > 0 && <p className="help">{t("En gris: grupos con menos de {n} contactados (poco confiables).", { n: MIN_GROUP })}</p>}
    </div>
  );
}
