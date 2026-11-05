import { headers } from "next/headers";

/** URL pública de la app: APP_PUBLIC_URL si está definida; si no, la del pedido actual. */
export async function baseUrl(): Promise<string> {
  if (process.env.APP_PUBLIC_URL) return process.env.APP_PUBLIC_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
