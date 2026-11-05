"use client";
import { useT } from "@/lib/i18n/client";
import { useActionState } from "react";
import { changePasswordAction, createUserAction, type FormState } from "@/app/auth-actions";

function Status({ state }: { state: FormState }) {
  const t = useT();
  if (state?.error) return <div className="notice" style={{ borderColor: "var(--err)" }}>{state.error}</div>;
  if (state?.ok) return <div className="notice" style={{ borderColor: "var(--ok)" }}>{state.ok}</div>;
  return null;
}

export function CreateUserForm() {
  const t = useT();
  const [state, action, pending] = useActionState(createUserAction, undefined);
  return (
    <form action={action} className="card">
      <h2>{t("Crear usuario")}</h2>
      <div className="field">
        <label htmlFor="nu">{t("Usuario")}</label>
        <input id="nu" name="username" required autoComplete="off" />
      </div>
      <div className="field">
        <label htmlFor="np">Contraseña (mín. 8 caracteres)</label>
        <input id="np" name="password" type="password" minLength={8} required autoComplete="new-password" />
      </div>
      <div className="field">
        <label htmlFor="nr">{t("Rol")}</label>
        <select id="nr" name="role" defaultValue="member">
          <option value="admin">{t("Administrador")}</option>
          <option value="member">{t("Miembro")}</option>
        </select>
      </div>
      <Status state={state} />
      <button className="btn" disabled={pending}>{t("Crear")}</button>
    </form>
  );
}

export function PasswordForm({ usernames, me }: { usernames: string[]; me: string }) {
  const t = useT();
  const [state, action, pending] = useActionState(changePasswordAction, undefined);
  return (
    <form action={action} className="card">
      <h2>{t("Cambiar contraseña")}</h2>
      <div className="field">
        <label htmlFor="pu">{t("Usuario")}</label>
        <select id="pu" name="username" defaultValue={me}>
          {usernames.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="pp">Nueva contraseña (mín. 8 caracteres)</label>
        <input id="pp" name="password" type="password" minLength={8} required autoComplete="new-password" />
      </div>
      <Status state={state} />
      <button className="btn" disabled={pending}>{t("Cambiar")}</button>
      <p className="help">{t("Al cambiar la contraseña se cierran las sesiones abiertas de ese usuario.")}</p>
    </form>
  );
}
