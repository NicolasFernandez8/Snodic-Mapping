import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, userFromToken, type User } from "./users";

export async function currentUser(): Promise<User | null> {
  return userFromToken((await cookies()).get(SESSION_COOKIE)?.value);
}

/** Para páginas y server actions: exige sesión (y rol admin si se pide). */
export async function requireUser(role?: "admin"): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (role === "admin" && user.role !== "admin") throw new Error("Solo administradores");
  return user;
}

/** Para route handlers: devuelve 401 en lugar de redirigir. */
export async function apiUser(): Promise<User | Response> {
  const user = await currentUser();
  return user ?? new Response("No autorizado", { status: 401 });
}
