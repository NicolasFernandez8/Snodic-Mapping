import { q } from "@/lib/db";
import { retryLocalityAction } from "../actions";
import { ClientMap } from "./client-map";

export const dynamic = "force-dynamic";

export default async function Mapa() {
  const failed = await q<{ id: number; name: string; last_error: string | null }>(
    "SELECT id, name, last_error FROM localities WHERE status = 'failed' ORDER BY name",
  );
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Mapa de sectores</h1>
          <div className="legend" style={{ marginTop: 6 }}>
            <span><i style={{ background: "#1c6fef" }} />Mapeada</span>
            <span><i style={{ background: "#d98a00" }} />Mapeando</span>
            <span><i style={{ background: "#8a9ab3" }} />Pendiente</span>
            <span><i style={{ background: "#d93a3a" }} />Error</span>
            <span><i style={{ background: "#12a150", borderRadius: 99 }} />Prospecto en Notion</span>
          </div>
        </div>
        <div className="row">
          <a className="btn" href="/api/export/kml?only=mapped">⬇ KML para My Maps (mapeadas)</a>
          <a className="btn secondary" href="/api/export/kml">⬇ KML completo</a>
        </div>
      </div>
      {failed.length > 0 && (
        <div className="notice">
          <strong>{failed.length} localidades con error.</strong>{" "}
          {failed.slice(0, 5).map((f) => (
            <form key={f.id} action={retryLocalityAction} style={{ display: "inline" }}>
              <input type="hidden" name="id" value={f.id} />
              <button className="btn secondary sm" title={f.last_error ?? ""} style={{ margin: "2px 4px" }}>
                Reintentar {f.name}
              </button>
            </form>
          ))}
        </div>
      )}
      <div className="map">
        <ClientMap />
      </div>
      <p className="help">
        Google My Maps no tiene API de escritura: descargá el KML y en tu mapa usá “Agregar capa → Importar”.
      </p>
    </>
  );
}
