import { ConfirmButton } from "@/app/confirm-button";
import { getT } from "@/lib/i18n/server";
import { requireUser } from "@/lib/auth/session";
import { listUsers } from "@/lib/auth/users";
import { deleteUserAction, setRoleAction } from "@/app/auth-actions";
import { fmtDate } from "@/app/ui";
import { CreateUserForm, PasswordForm } from "./forms";

export const dynamic = "force-dynamic";

export default async function Usuarios() {
  const t = await getT();
  const me = await requireUser();
  const isAdmin = me.role === "admin";
  const users = isAdmin ? await listUsers() : [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t("Usuarios")}</h1>
          <p className="sub">{isAdmin ? t("Administrá quién puede entrar a Snodic Mapping.") : t("Tu cuenta.")}</p>
        </div>
      </div>

      {isAdmin && (
        <div className="card table-wrap" style={{ marginBottom: 16, padding: 0 }}>
          <table>
            <thead>
              <tr><th>{t("Usuario")}</th><th>{t("Rol")}</th><th>{t("Alta")}</th><th>{t("Último ingreso")}</th><th></th></tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td><strong>{u.username}</strong>{u.id === me.id && <span className="help"> (vos)</span>}</td>
                  <td>
                    <form action={setRoleAction} className="row">
                      <input type="hidden" name="username" value={u.username} />
                      <select name="role" defaultValue={u.role} style={{ width: "auto" }} disabled={u.id === me.id}>
                        <option value="admin">{t("Administrador")}</option>
                        <option value="member">{t("Miembro")}</option>
                      </select>
                      {u.id !== me.id && <button className="btn secondary sm">{t("Guardar")}</button>}
                    </form>
                  </td>
                  <td className="sub">{fmtDate(u.created_at)}</td>
                  <td className="sub">{fmtDate(u.last_login_at)}</td>
                  <td>
                    {u.id !== me.id && (
                      <form action={deleteUserAction}>
                        <input type="hidden" name="username" value={u.username} />
                        <ConfirmButton label="Borrar" message="¿Borrar este usuario? Ya no va a poder entrar." />
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid two">
        {isAdmin && <CreateUserForm />}
        <PasswordForm usernames={isAdmin ? users.map((u) => u.username) : [me.username]} me={me.username} />
      </div>
    </>
  );
}
