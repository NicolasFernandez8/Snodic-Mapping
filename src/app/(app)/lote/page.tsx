import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { batchCandidates, buildBatchPrompt } from "@/lib/batch";
import type { OutputKind } from "@/lib/agents/agent34-writer";
import { saveBatchAction } from "@/app/feature-actions";
import { CopyButton } from "@/app/copy-button";
import { FilterBar } from "../filter-bar";
import { requireUser } from "@/lib/auth/session";
import { filtersToQuery, parseFilters } from "@/lib/filters";

export const dynamic = "force-dynamic";

export default async function Lote({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const t = await getT();
  const sp = await searchParams;
  const kind: OutputKind = sp.kind === "report" ? "report" : "message";
  const n = Math.max(1, Math.min(10, Number(sp.n ?? 5)));
  const me = await requireUser();
  const filters = parseFilters(sp as Record<string, string>);
  const items = await batchCandidates(kind, n, filters, me.id);
  const prompt = items.length ? await buildBatchPrompt(kind, items.map((i) => i.id)) : "";

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t("Prompts en lote")}</h1>
          <p className="sub">{t("Un solo prompt para varios prospectos: copiás, pegás en tu app de Claude y pegás la respuesta acá.")}</p>
        </div>
        <form className="row">
          {Object.entries(parseFilters(sp as Record<string, string>)).length > 0 &&
            new URLSearchParams(filtersToQuery(filters)).toString().split("&").map((kv) => {
              const [k, v] = kv.split("=").map(decodeURIComponent);
              return <input key={kv} type="hidden" name={k} value={v} />;
            })}
          <select name="kind" defaultValue={kind} style={{ width: "auto" }}>
            <option value="message">{t("Mensajes (Agente 3)")}</option>
            <option value="report">{t("Informes (Agente 4)")}</option>
          </select>
          <select name="n" defaultValue={String(n)} style={{ width: "auto" }}>
            {[3, 5, 8, 10].map((x) => (
              <option key={x} value={x}>{t("{n} prospectos", { n: x })}</option>
            ))}
          </select>
          <button className="btn secondary">{t("Armar lote")}</button>
        </form>
      </div>

      <FilterBar path="/lote" filters={filters} hidden={{ kind, n: String(n) }} />
      {sp.saved !== undefined && (
        <div className="notice" style={{ borderColor: sp.missing ? "var(--warn)" : "var(--ok)" }}>
          {t("Guardados: {n}.", { n: sp.saved })}{" "}
          {sp.missing ? t("Sin respuesta en el texto pegado: {ids}. Quedan para el próximo lote.", { ids: sp.missing }) : ""}
        </div>
      )}

      {items.length === 0 ? (
        <div className="card empty">
          {kind === "message"
            ? t("No hay prospectos con reseñas esperando mensaje.")
            : t("No hay prospectos con mensaje esperando informe.")}
        </div>
      ) : (
        <div className="grid two">
          <div className="card">
            <h2>{t("1. Copiá el prompt")}</h2>
            <ul style={{ margin: "0 0 10px", paddingLeft: 18 }}>
              {items.map((i) => (
                <li key={i.id}>
                  <Link href={`/prospectos/${i.id}`}>#{i.id} {i.name}</Link>{" "}
                  <span className="help">· {t("{n} reseñas", { n: i.reviews })} · {i.score ?? "-"}</span>
                </li>
              ))}
            </ul>
            <CopyButton text={prompt} label={t("Copiar prompt del lote")} />
            <details style={{ marginTop: 10 }}>
              <summary>{t("Ver prompt")}</summary>
              <div className="pre" style={{ maxHeight: 360, overflow: "auto", fontSize: 12 }}>{prompt}</div>
            </details>
          </div>
          <form action={saveBatchAction} className="card">
            <h2>{t("2. Pegá la respuesta")}</h2>
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="ids" value={items.map((i) => i.id).join(",")} />
            <textarea name="content" rows={16} required placeholder="===RESPUESTA 12===&#10;…&#10;===FIN 12===" />
            <p className="help">{t("Cada resultado se guarda en su ficha y se valida con las reglas del prompt.")}</p>
            <button className="btn">{t("Guardar lote")}</button>
          </form>
        </div>
      )}
    </>
  );
}
