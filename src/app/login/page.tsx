import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await currentUser()) redirect("/");
  return (
    <div className="login-wrap">
      <div className="card login-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Snodic" className="login-logo" />
        <h1 style={{ textAlign: "center" }}>Snodic Mapping</h1>
        <p className="sub" style={{ textAlign: "center", marginBottom: 20 }}>
          Ingresá con tu usuario
        </p>
        <LoginForm />
      </div>
    </div>
  );
}
