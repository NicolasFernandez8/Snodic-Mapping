import { apiUser } from "@/lib/auth/session";
import { liveStatus } from "@/lib/status";

export const dynamic = "force-dynamic";

/** Estado para el refresco en vivo (requiere sesión). */
export async function GET() {
  const auth = await apiUser();
  if (auth instanceof Response) return auth;
  return Response.json(await liveStatus(), { headers: { "Cache-Control": "no-store" } });
}
