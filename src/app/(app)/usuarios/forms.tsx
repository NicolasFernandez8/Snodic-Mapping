"use client";
import { useActionState } from "react";
import { changePasswordAction, createUserAction, type FormState } from "@/app/auth-actions";

function Status({ state }: { state: FormState }) {
  if (state?.error) return <div className="notice" style={{ borderColor: "var(--err)" }}>{state.error}</div>;
  if (state?.ok) return <div className="notice" style={{ borderColor: "var(--ok)" }}>{state.ok}</div>;
  return null;
}

export function CreateUserForm() {
  const [state, action, pending] = useActionState(createUserAction, undefined);
  return (
    <form action={action} className="card">
      <h2>Crear usuario</h2>
      <div className="field">
        <label htmlFor="nu">Usuario</label>
        <input id="nu" name="username" required autoComplete="off" />
      </div>
      <div className="field">
        <label htmlFor="np">Contraseña (mín. 8 caracteres)</label>
        <input id="np" name="password" type="password" minLength={8} required autoComplete="new-password" />
      </div>
      <div className="field">
        <label htmlFor="nr">Rol</label>
        <select id="nr" name="role" defaultValue="member">
          <option value="admin">Administrador</option>
          <option value="member">Miembro</option>
        </select>
      </div>
      <Status state={state} />
      <button className="btn" disabled={pending}>Crear</button>
    </form>
  );
}

export function PasswordForm({ usernames, me }: { usernames: string[]; me: string }) {
  const [state, action, pending] = useActionState(changePasswordAction, undefined);
  return (
    <form action={action} className="card">
      <h2>Cambiar contraseña</h2>
      <div className="field">
        <label htmlFor="pu">Usuario</label>
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
      <button className="btn" disabled={pending}>Cambiar</button>
      <p className="help">Al cambiar la contraseña se cierran las sesiones abiertas de ese usuario.</p>
    </form>
  );
}
