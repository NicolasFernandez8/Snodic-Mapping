import { NextResponse, type NextRequest } from "next/server";

/**
 * Protección opcional con HTTP Basic (APP_BASIC_AUTH="usuario:contraseña").
 * La app está pensada para usarse en privado detrás de Tailscale; esto es una capa extra.
 */
export function middleware(req: NextRequest) {
  const expected = process.env.APP_BASIC_AUTH;
  if (!expected) return NextResponse.next();
  const header = req.headers.get("authorization") ?? "";
  const [scheme, value] = header.split(" ");
  if (scheme === "Basic" && value && safeEqual(atob(value), expected)) return NextResponse.next();
  return new NextResponse("Autenticación requerida", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Snodic Mapping"' },
  });
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export const config = { matcher: ["/((?!_next/static|_next/image|logo.png).*)"] };
