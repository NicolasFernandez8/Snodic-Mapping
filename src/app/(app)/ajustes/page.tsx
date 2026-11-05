import { getSetting, q } from "@/lib/db";
import type { Niche } from "@/lib/agents/types";
import { importRegionAction, saveNiche, saveSettings } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function Ajustes() {
  const [niches, active, quota, source, auto, notion] = await Promise.all([
    q<Niche>("SELECT * FROM niches ORDER BY label"),
    getSetting<string>("active_niche", "hospitality"),
    getSetting<number>("daily_locality_quota", 3),
    getSetting<string>("prospect_source", "osm"),
    getSetting<boolean>("auto_generate_outputs", true),
    getSetting<boolean>("notion_enabled", false),
  ]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Ajustes</h1>
          <p className="sub">Rubro del automapeo, ritmo diario y zonas a recorrer.</p>
        </div>
      </div>

      <div className="grid two">
        <form action={saveSettings} className="card">
          <h2>Automapeo</h2>
          <div className="field">
            <label htmlFor="active_niche">Rubro activo</label>
            <select id="active_niche" name="active_niche" defaultValue={active}>
              {niches.map((n) => (
                <option key={n.key} value={n.key}>{n.label}</option>
              ))}
            </select>
            <p className="help">El Agente 1 solo guarda lugares de este rubro. Podés crear rubros nuevos abajo.</p>
          </div>
          <div className="field">
            <label htmlFor="daily_locality_quota">Localidades por día</label>
            <input id="daily_locality_quota" name="daily_locality_quota" type="number" min={1} max={50} defaultValue={quota} />
          </div>
          <div className="field">
            <label htmlFor="prospect_source">Fuente de prospectos</label>
            <select id="prospect_source" name="prospect_source" defaultValue={source}>
              <option value="osm">OpenStreetMap (gratis, sin clave)</option>
              <option value="google_places">Google Places API (requiere facturación: no usar)</option>
            </select>
          </div>
          <div className="field row">
            <input id="auto" name="auto_generate_outputs" type="checkbox" defaultChecked={auto} style={{ width: "auto" }} />
            <label htmlFor="auto" style={{ margin: 0 }}>El pipeline diario también genera mensajes e informes (agentes 3 y 4)</label>
          </div>
          <div className="field row">
            <input id="notion" name="notion_enabled" type="checkbox" defaultChecked={notion} style={{ width: "auto" }} />
            <label htmlFor="notion" style={{ margin: 0 }}>Enviar a Notion</label>
          </div>
          <p className="help" style={{ marginTop: -6 }}>
            Apagado: todo queda solo en la app (prospectos, mensajes e informes). Encendelo cuando quieras volcar a Notion;
            se envían también los acumulados.
          </p>
          <button className="btn">Guardar</button>
        </form>

        <form action={importRegionAction} className="card" id="region">
          <h2>Agregar región</h2>
          <div className="field">
            <label htmlFor="name">Nombre</label>
            <input id="name" name="name" placeholder="Alicante" required />
          </div>
          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div className="field">
              <label htmlFor="adminLevel">Nivel de la región</label>
              <select id="adminLevel" name="adminLevel" defaultValue="6">
                <option value="4">4 · Comunidad autónoma</option>
                <option value="6">6 · Provincia</option>
                <option value="7">7 · Comarca</option>
                <option value="8">8 · Municipio</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="localityLevel">Dividir en</label>
              <select id="localityLevel" name="localityLevel" defaultValue="8">
                <option value="7">7 · Comarcas</option>
                <option value="8">8 · Municipios</option>
                <option value="9">9 · Distritos</option>
                <option value="10">10 · Barrios</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="relationId">ID de relación OSM (opcional)</label>
            <input id="relationId" name="relationId" inputMode="numeric" placeholder="Si el nombre es ambiguo" />
          </div>
          <div className="field">
            <label htmlFor="kml">…o importar sectores propios (KML de My Maps)</label>
            <input id="kml" name="kml" type="file" accept=".kml,application/vnd.google-earth.kml+xml" />
            <p className="help">
              En My Maps: menú ⋮ → Exportar a KML/KMZ → marcar “Exportar como KML”. Cada polígono se convierte en una localidad.
            </p>
          </div>
          <button className="btn">Importar región</button>
          <p className="help">
            Ej.: provincia de Alicante en municipios = nivel 6 → 8. Ciudad de Alicante en barrios = nivel 8 → 10.
            Las regiones se recorren en orden: al terminar una empieza la siguiente.
          </p>
        </form>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Rubros</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Rubro</th><th>Tipos de Google</th><th>Búsquedas</th><th>Etiquetas OSM</th><th>En el mensaje</th></tr>
            </thead>
            <tbody>
              {niches.map((n) => (
                <tr key={n.key}>
                  <td><strong>{n.label}</strong><div className="help">{n.key}</div></td>
                  <td>{n.google_types.join(", ") || "-"}</td>
                  <td>{n.keywords.join(", ") || "-"}</td>
                  <td>{n.osm_tags.map((t) => `${t.k}=${t.v}`).join(", ") || "-"}</td>
                  <td>“algunos {n.business_label}”</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <form action={saveNiche} style={{ marginTop: 18 }}>
          <h2>Crear o editar rubro</h2>
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
            <div><label htmlFor="label">Nombre</label><input id="label" name="label" placeholder="Clínicas dentales" required /></div>
            <div><label htmlFor="key">Clave (opcional, para editar uno existente)</label><input id="key" name="key" placeholder="dentists" /></div>
            <div><label htmlFor="business_label">Cómo se nombra en el mensaje</label><input id="business_label" name="business_label" placeholder="clínicas" /></div>
            <div><label htmlFor="google_types">Tipos de Google Places</label><input id="google_types" name="google_types" placeholder="dentist, dental_clinic" /></div>
            <div><label htmlFor="keywords">Búsquedas</label><input id="keywords" name="keywords" placeholder="clínica dental, dentista" /></div>
            <div><label htmlFor="osm_tags">Etiquetas OSM</label><input id="osm_tags" name="osm_tags" placeholder="amenity=dentist, healthcare=dentist" /></div>
          </div>
          <p className="help">
            Tipos válidos: ver “Place types (New)” en la documentación de Google. Separá con comas.
          </p>
          <button className="btn">Guardar rubro</button>
        </form>
      </div>
    </>
  );
}
