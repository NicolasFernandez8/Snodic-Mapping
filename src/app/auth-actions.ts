"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import {
  createUser,
  deleteUser,
  login,
  logout,
  SESSION_COOKIE,
  SESSION_DAYS,
  setPassword,
  setRole,
  type Role,
} from "@/lib/auth/users";

export type FormState = { error?: string; ok?: string; username?: string } | undefined;

export async function loginAction(_: FormState, formData: FormData): Promise<FormState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!username || !password) return { error: "Completá usuario y contraseña", username };
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  let token: string | null;
  try {
    token = await login(username, password, ip);
  } catch (e) {
    return { error: (e as Error).message, username };
  }
  if (!token) return { error: "Usuario o contraseña incorrectos", username };
  const proto = h.get("x-forwarded-proto") ?? "http";
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: proto === "https",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 3600,
  });
  redirect("/");
}

export async function logoutAction() {
  const jar = await cookies();
  await logout(jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}

const role = (v: FormDataEntryValue | null): Role => (v === "admin" ? "admin" : "member");

export async function createUserAction(_: FormState, formData: FormData): Promise<FormState> {
  await requireUser("admin");
  try {
    const u = await createUser(String(formData.get("username") ?? "").trim(), String(formData.get("password") ?? ""), role(formData.get("role")));
    revalidatePath("/usuarios");
    return { ok: `Usuario ${u.username} creado` };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function changePasswordAction(_: FormState, formData: FormData): Promise<FormState> {
  const me = await requireUser();
  const target = String(formData.get("username") ?? me.username);
  // Cada usuario puede cambiar la suya; un admin puede cambiar cualquiera.
  if (target.toLowerCase() !== me.username.toLowerCase() && me.role !== "admin") return { error: "Solo administradores" };
  try {
    await setPassword(target, String(formData.get("password") ?? ""));
    if (target.toLowerCase() === me.username.toLowerCase()) redirect("/login");
    return { ok: `Contraseña de ${target} actualizada` };
  } catch (e) {
    if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
    return { error: (e as Error).message };
  }
}

export async function setRoleAction(formData: FormData) {
  await requireUser("admin");
  await setRole(String(formData.get("username")), role(formData.get("role")));
  revalidatePath("/usuarios");
}

export async function deleteUserAction(formData: FormData) {
  const me = await requireUser("admin");
  const target = String(formData.get("username"));
  if (target.toLowerCase() === me.username.toLowerCase()) throw new Error("No podés borrar tu propio usuario");
  await deleteUser(target);
  revalidatePath("/usuarios");
}
