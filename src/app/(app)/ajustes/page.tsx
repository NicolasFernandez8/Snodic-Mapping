import { getT } from "@/lib/i18n/server";
import { getSetting, q } from "@/lib/db";
import type { Niche } from "@/lib/agents/types";
import { importRegionAction, saveNiche, saveSettings } from "@/app/actions";
import { saveOutreachSettingsAction, saveVariantAction } from "@/app/crm-actions";

export const dynamic = "force-dynamic";

export default async function Ajustes() {
  const t = await getT();
  const [niches, active, quota, source, auto, notion, variants, fuDays, fuMax, wa] = await Promise.all([
    q<Niche>("SELECT * FROM niches ORDER BY label"),
    getSetting<string>("active_niche", "hospitality"),
    getSetting<number>("daily_locality_quota", 3),
    getSetting<string>("prospect_source", "osm"),
    getSetting<boolean>("auto_generate_outputs", true),
    getSetting<boolean>("notion_enabled", false),
    q<{ key: string; label: string; instructions: string; active: boolean }>(
      "SELECT key, label, instructions, active FROM message_variants ORDER BY key",
    ),
    getSetting<number>("follow_up_days", 3),
    getSetting<number>("follow_up_max", 2),
    getSetting<string>("contact_whatsapp", ""),
  ]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t("Ajustes")}</h1>
          <p className="sub">{t("Rubro del automapeo, ritmo diario y zonas a recorrer.")}</p>
        </div>
      </div>

      <div className="grid two">
        <form action={saveSettings} className="card">
          <h2>{t("Automapeo")}</h2>
          <div className="field">
            <label htmlFor="active_niche">{t("Rubro activo")}</label>
            <select id="active_niche" name="active_niche" defaultValue={active}>
              {niches.map((n) => (
                <option key={n.key} value={n.key}>{n.label}</option>
              ))}
            </select>
            <p className="help">{t("El Agente 1 solo guarda lugares de este rubro. Podés crear rubros nuevos abajo.")}</p>
          </div>
          <div className="field">
            <label htmlFor="daily_locality_quota">{t("Localidades por día")}</label>
            <input id="daily_locality_quota" name="daily_locality_quota" type="number" min={1} max={50} defaultValue={quota} />
          </div>
          <div className="field">
            <label htmlFor="prospect_source">{t("Fuente de prospectos")}</label>
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
            <label htmlFor="notion" style={{ margin: 0 }}>{t("Enviar a Notion")}</label>
          </div>
          <p className="help" style={{ marginTop: -6 }}>
            {t("Apagado: todo queda solo en la app (prospectos, mensajes e informes). Encendelo cuando quieras volcar a Notion; se envían también los acumulados.")}
          </p>
          <button className="btn">{t("Guardar")}</button>
        </form>

        <form action={importRegionAction} className="card" id="region">
          <h2>{t("Agregar región")}</h2>
          <div className="field">
            <label htmlFor="name">{t("Nombre")}</label>
            <input id="name" name="name" placeholder={t("Alicante")} required />
          </div>
          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div className="field">
              <label htmlFor="adminLevel">{t("Nivel de la región")}</label>
              <select id="adminLevel" name="adminLevel" defaultValue="6">
                <option value="4">{t("4 · Comunidad autónoma")}</option>
                <option value="6">{t("6 · Provincia")}</option>
                <option value="7">{t("7 · Comarca")}</option>
                <option value="8">{t("8 · Municipio")}</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="localityLevel">{t("Dividir en")}</label>
              <select id="localityLevel" name="localityLevel" defaultValue="8">
                <option value="7">{t("7 · Comarcas")}</option>
                <option value="8">{t("8 · Municipios")}</option>
                <option value="9">{t("9 · Distritos")}</option>
                <option value="10">{t("10 · Barrios")}</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="relationId">ID de relación OSM (opcional)</label>
            <input id="relationId" name="relationId" inputMode="numeric" placeholder={t("Si el nombre es ambiguo")} />
          </div>
          <div className="field">
            <label htmlFor="kml">…o importar sectores propios (KML de My Maps)</label>
            <input id="kml" name="kml" type="file" accept=".kml,application/vnd.google-earth.kml+xml" />
            <p className="help">
              {t("En My Maps: menú ⋮ → Exportar a KML/KMZ → marcar “Exportar como KML”. Cada polígono se convierte en una localidad.")}
            </p>
          </div>
          <button className="btn">{t("Importar región")}</button>
          <p className="help">
            {t("Ej.: provincia de Alicante en municipios = nivel 6 → 8. Ciudad de Alicante en barrios = nivel 8 → 10. Las regiones se recorren en orden: al terminar una empieza la siguiente.")}
          </p>
        </form>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>{t("Rubros")}</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>{t("Rubro")}</th><th>{t("Tipos de Google")}</th><th>{t("Búsquedas")}</th><th>{t("Etiquetas OSM")}</th><th>{t("En el mensaje")}</th></tr>
            </thead>
            <tbody>
              {niches.map((n) => (
                <tr key={n.key}>
                  <td><strong>{n.label}</strong><div className="help">{n.key}</div></td>
                  <td>{n.google_types.join(", ") || "-"}</td>
                  <td>{n.keywords.join(", ") || "-"}</td>
                  <td>{n.osm_tags.map((t) => `${t.k}=${t.v}`).join(", ") || "-"}</td>
                  <td>{t("“algunos")}{" "}{n.business_label}”</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <form action={saveNiche} style={{ marginTop: 18 }}>
          <h2>{t("Crear o editar rubro")}</h2>
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
            <div><label htmlFor="label">{t("Nombre")}</label><input id="label" name="label" placeholder={t("Clínicas dentales")} required /></div>
            <div><label htmlFor="key">Clave (opcional, para editar uno existente)</label><input id="key" name="key" placeholder={t("dentists")} /></div>
            <div><label htmlFor="business_label">{t("Cómo se nombra en el mensaje")}</label><input id="business_label" name="business_label" placeholder={t("clínicas")} /></div>
            <div><label htmlFor="google_types">{t("Tipos de Google Places")}</label><input id="google_types" name="google_types" placeholder={t("dentist, dental_clinic")} /></div>
            <div><label htmlFor="keywords">{t("Búsquedas")}</label><input id="keywords" name="keywords" placeholder={t("clínica dental, dentista")} /></div>
            <div><label htmlFor="osm_tags">{t("Etiquetas OSM")}</label><input id="osm_tags" name="osm_tags" placeholder={t("amenity=dentist, healthcare=dentist")} /></div>
          </div>
          <p className="help">
            {t("Tipos válidos: ver “Place types (New)” en la documentación de Google. Separá con comas.")}
          </p>
          <button className="btn">{t("Guardar rubro")}</button>
        </form>
      </div>
      <div className="grid two" style={{ marginTop: 16 }}>
        <form action={saveOutreachSettingsAction} className="card">
          <h2>{t("Contacto y seguimientos")}</h2>
          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div className="field">
              <label htmlFor="follow_up_days">{t("Días hasta el seguimiento")}</label>
              <input id="follow_up_days" name="follow_up_days" type="number" min={1} max={30} defaultValue={fuDays} />
            </div>
            <div className="field">
              <label htmlFor="follow_up_max">{t("Máximo de seguimientos")}</label>
              <input id="follow_up_max" name="follow_up_max" type="number" min={0} max={5} defaultValue={fuMax} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="contact_whatsapp">Tu WhatsApp (para el botón de la mini-auditoría)</label>
            <input id="contact_whatsapp" name="contact_whatsapp" defaultValue={wa} placeholder="34600000000" />
          </div>
          <button className="btn">{t("Guardar")}</button>
        </form>

        <div className="card">
          <h2>Variantes del mensaje (A/B)</h2>
          <p className="help" style={{ marginTop: 0 }}>
            {t("Se reparten en partes iguales entre los prospectos nuevos. La indicación se suma al prompt del Agente 3 sin cambiar sus reglas. Compará resultados en Métricas.")}
          </p>
          {variants.map((v) => (
            <form key={v.key} action={saveVariantAction} style={{ borderTop: "1px solid var(--border)", paddingTop: 10, marginTop: 10 }}>
              <input type="hidden" name="key" value={v.key} />
              <div className="row">
                <strong>{v.key}</strong>
                <input name="label" defaultValue={v.label} style={{ flex: 1 }} />
                <label className="row" style={{ margin: 0, fontWeight: 500 }}>
                  <input type="checkbox" name="active" defaultChecked={v.active} style={{ width: "auto" }} />{" "}{t("Activa")}
                </label>
              </div>
              <textarea name="instructions" defaultValue={v.instructions} rows={2} style={{ marginTop: 6, minHeight: 0 }} placeholder={t("Vacío = prompt original")} />
              <button className="btn secondary sm" style={{ marginTop: 6 }}>{t("Guardar {k}", { k: v.key })}</button>
            </form>
          ))}
          <form action={saveVariantAction} style={{ borderTop: "1px solid var(--border)", paddingTop: 10, marginTop: 10 }}>
            <div className="row">
              <input name="key" placeholder={t("D")} style={{ width: 60 }} required />
              <input name="label" placeholder={t("Nombre de la variante")} style={{ flex: 1 }} required />
              <input type="hidden" name="active" value="on" />
            </div>
            <textarea name="instructions" rows={2} style={{ marginTop: 6, minHeight: 0 }} placeholder={t("Indicación extra para el Agente 3")} />
            <button className="btn sm" style={{ marginTop: 6 }}>{t("Agregar variante")}</button>
          </form>
        </div>
      </div>
    </>
  );
}
