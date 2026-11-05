"use client";
import { useActionState } from "react";
import { loginAction } from "@/app/auth-actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, undefined);
  return (
    <form action={action}>
      <div className="field">
        <label htmlFor="username">Usuario</label>
        <input id="username" name="username" autoComplete="username" autoFocus required defaultValue={state?.username} key={state?.username} />
      </div>
      <div className="field">
        <label htmlFor="password">Contraseña</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {state?.error && (
        <div className="notice" role="alert" style={{ borderColor: "var(--err)" }}>
          {state.error}
        </div>
      )}
      <button className="btn" style={{ width: "100%", justifyContent: "center" }} disabled={pending}>
        {pending ? "Ingresando…" : "Ingresar"}
      </button>
    </form>
  );
}
