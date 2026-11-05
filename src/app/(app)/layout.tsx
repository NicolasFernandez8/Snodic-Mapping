import { getT } from "@/lib/i18n/server";
import { requireUser } from "@/lib/auth/session";
import { logoutAction } from "@/app/auth-actions";
import { Nav } from "@/app/nav";
import { NodeNetwork } from "@/app/node-network";
import { Preferences } from "@/app/preferences";
import { getTheme } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const t = await getT();
  const user = await requireUser();
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
      <main>{children}</main>
    </div>
  );
}
