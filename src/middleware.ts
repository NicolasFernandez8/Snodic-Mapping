import { NextResponse, type NextRequest } from "next/server";

/**
 * Primer filtro: sin cookie de sesión se redirige a /login (o 401 en /api).
 * La validación real de la sesión contra la base se hace en el servidor (requireUser / apiUser).
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // /login y las mini-auditorías públicas (/a/<código>) no requieren sesión.
  if (pathname === "/login" || pathname.startsWith("/a/") || pathname === "/api/health") return NextResponse.next();
  if (req.cookies.get("snodic_session")?.value) return NextResponse.next();
  if (pathname.startsWith("/api/")) return new NextResponse("No autorizado", { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|logo.png|favicon.ico|manifest.webmanifest|sw.js|icon-192.png|icon-512.png).*)"],
};
