import { getT } from "@/lib/i18n/server";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { LoginForm } from "./login-form";
import { NodeNetwork } from "@/app/node-network";
import { Preferences } from "@/app/preferences";
import { getTheme } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const t = await getT();
  if (await currentUser()) redirect("/");
  return (
    <div className="login-wrap">
      <NodeNetwork className="node-login" density={1.2} />
      <div className="login-prefs">
        <Preferences theme={await getTheme()} />
      </div>
      <div className="card login-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Snodic" className="login-logo" />
        <h1 style={{ textAlign: "center" }}>{t("Snodic Mapping")}</h1>
        <p className="sub" style={{ textAlign: "center", marginBottom: 20 }}>
          {t("Ingresá con tu usuario")}
        </p>
        <LoginForm />
      </div>
    </div>
  );
}
