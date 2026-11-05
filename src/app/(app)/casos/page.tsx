import { listCases } from "@/lib/cases";
import { PAIN_KEYWORDS } from "@/lib/scoring";
import { deleteCaseAction, saveCaseAction } from "@/app/crm-actions";
import { V } from "@/app/ui";

export const dynamic = "force-dynamic";

export default async function Casos() {
  const cases = await listCases();
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Casos de éxito</h1>
          <p className="sub">
            Se sugieren solos en la ficha y en los seguimientos cuando las reseñas del prospecto muestran el mismo problema.
          </p>
        </div>
      </div>
      <div className="grid two" style={{ marginBottom: 16 }}>
        {cases.length === 0 && <div className="card empty">Todavía no cargaste casos. Empezá con el primero que cierres.</div>}
        {cases.map((c) => (
          <div key={c.id} className="card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong>{c.title}</strong>
              <form action={deleteCaseAction}>
                <input type="hidden" name="case_id" value={c.id} />
                <button className="btn danger sm">Borrar</button>
              </form>
            </div>
            <p style={{ margin: "8px 0" }}>{c.summary}</p>
            <p className="help">Resultado: <V v={c.result} /> · Link: <V v={c.link} href /></p>
            <div className="row">{c.tags.map((t) => <span key={t} className="badge">{t}</span>)}</div>
          </div>
        ))}
      </div>
      <form action={saveCaseAction} className="card">
        <h2>Nuevo caso</h2>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12 }}>
          <div><label htmlFor="title">Título</label><input id="title" name="title" placeholder="Hotel boutique en Alicante centro" required /></div>
          <div>
            <label htmlFor="tags">Problemas que resolvió (separados por coma)</label>
            <input id="tags" name="tags" placeholder="reservas, teléfono" />
            <p className="help">Detectables: {PAIN_KEYWORDS.map((p) => p.tag).join(", ")}</p>
          </div>
          <div><label htmlFor="result">Resultado (para el mensaje)</label><input id="result" name="result" placeholder="un hotel del centro a conseguir +20 % de reservas directas" /></div>
          <div><label htmlFor="link">Link (opcional)</label><input id="link" name="link" placeholder="https://…" /></div>
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <label htmlFor="summary">Resumen</label>
          <textarea id="summary" name="summary" rows={3} required placeholder="Qué problema tenían, qué hicimos y en cuánto tiempo." />
        </div>
        <button className="btn">Guardar caso</button>
      </form>
    </>
  );
}
