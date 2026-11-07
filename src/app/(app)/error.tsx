"use client";
import { useT } from "@/lib/i18n/client";

/** Pantalla amigable cuando una página falla (en vez del "Application error" en blanco). */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();
  return (
    <div className="card" style={{ maxWidth: 640, margin: "40px auto" }}>
      <h1 style={{ marginTop: 0 }}>{t("No se pudo cargar esta sección")}</h1>
      <p>{t("Si acabás de actualizar la app, lo más probable es que falte aplicar las migraciones de la base. En la PC corré:")}</p>
      <pre className="pre">docker compose --profile tools run --rm migrate</pre>
      <p className="help">{t("Después recargá con Ctrl+F5. Si sigue fallando, mirá el detalle con:")} <code>docker compose logs web --tail 50</code></p>
      {error.digest && <p className="help">{t("Código del error:")} {error.digest}</p>}
      <button className="btn" onClick={reset}>{t("Reintentar")}</button>
    </div>
  );
}
