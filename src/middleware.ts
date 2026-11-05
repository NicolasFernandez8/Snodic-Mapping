import { NextResponse, type NextRequest } from "next/server";

/**
 * Primer filtro: sin cookie de sesión se redirige a /login (o 401 en /api).
 * La validación real de la sesión contra la base se hace en el servidor (requireUser / apiUser).
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/login") return NextResponse.next();
  if (req.cookies.get("snodic_session")?.value) return NextResponse.next();
  if (pathname.startsWith("/api/")) return new NextResponse("No autorizado", { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image|logo.png|favicon.ico).*)"] };
