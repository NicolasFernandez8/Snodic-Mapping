import { requireUser } from "@/lib/auth/session";
import { logoutAction } from "@/app/auth-actions";
import { Nav } from "@/app/nav";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Snodic" />
          <div>
            <strong>snodic</strong>
            <span>Mapping</span>
          </div>
        </div>
        <Nav isAdmin={user.role === "admin"} />
        <div className="foot">
          <div style={{ color: "#c9d6ea", fontWeight: 600 }}>{user.username}</div>
          <div>{user.role === "admin" ? "Administrador" : "Miembro"}</div>
          <form action={logoutAction} style={{ marginTop: 8 }}>
            <button className="btn secondary sm" style={{ background: "transparent", color: "#c9d6ea", borderColor: "#2a4472" }}>
              Cerrar sesión
            </button>
          </form>
        </div>
      </aside>
      <main>{children}</main>
    </div>
  );
}
