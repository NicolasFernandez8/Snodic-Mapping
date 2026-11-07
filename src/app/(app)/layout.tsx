import { getT } from "@/lib/i18n/server";
import { requireUser } from "@/lib/auth/session";
import { logoutAction } from "@/app/auth-actions";
import { Nav } from "@/app/nav";
import { NodeNetwork } from "@/app/node-network";
import { Preferences } from "@/app/preferences";
import { getTheme } from "@/lib/i18n/server";
import { pendingMigrations } from "@/lib/migration-status";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const t = await getT();
  const user = await requireUser();
  const pending = await pendingMigrations();
  return (
    <div className="shell">
      <NodeNetwork />
      <aside className="sidebar">
        <NodeNetwork className="node-side" density={0.35} interactive={false} />
        <div className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Snodic" />
          <div>
            <strong>Snodic</strong>
            <span>{t("Mapping")}</span>
          </div>
        </div>
        {/* En el celular el menú se pliega: se abre con este botón (sin JS) y se cierra solo al cambiar de página. */}
        <input type="checkbox" id="menu-toggle" className="menu-toggle" aria-label={t("Menú")} />
        <label htmlFor="menu-toggle" className="menu-btn" aria-hidden>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          {t("Menú")}
        </label>
        <Nav isAdmin={user.role === "admin"} />
        <div className="foot">
          <div style={{ marginBottom: 10 }}>
            <Preferences theme={await getTheme()} />
          </div>
          <div style={{ color: "#c9d6ea", fontWeight: 600 }}>{user.username}</div>
          <div>{user.role === "admin" ? t("Administrador") : t("Miembro")}</div>
          <form action={logoutAction} style={{ marginTop: 8 }}>
            <button className="btn secondary sm" style={{ background: "transparent", color: "var(--side-text)", borderColor: "var(--side-line)" }}>
              {t("Cerrar sesión")}
            </button>
          </form>
        </div>
      </aside>
      <main>
        {pending.length > 0 && (
          <div className="notice migrate-notice">
            <strong>{t("Falta actualizar la base de datos")}</strong> ({pending.join(", ")}).{" "}
            {t("Algunas secciones pueden mostrarse incompletas. En la PC corré:")}
            <code>docker compose --profile tools run --rm migrate</code>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
