import { apiUser } from "@/lib/auth/session";
import { one } from "@/lib/db";

export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/**
 * Archivo de calendario (.ics) para una reunión con el prospecto: se abre con Google Calendar,
 * Outlook o el calendario del celular. ?date=2026-11-10&time=10:30&minutes=30 (hora de Madrid).
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser();
  if (auth instanceof Response) return auth;
  const id = Number((await params).id);
  const url = new URL(req.url);
  const date = url.searchParams.get("date") ?? "";
  const time = url.searchParams.get("time") ?? "10:00";
  const minutes = Math.max(15, Math.min(240, Number(url.searchParams.get("minutes") ?? 30)));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return new Response("Fecha u hora inválida", { status: 400 });
  const p = await one<{ name: string; phone: string | null; address: string | null; google_maps_url: string | null }>(
    "SELECT name, phone, address, google_maps_url FROM prospects WHERE id = $1",
    [id],
  );
  if (!p) return new Response("No existe", { status: 404 });
  const start = `${date.replace(/-/g, "")}T${time.replace(":", "")}00`;
  const endDate = new Date(`${date}T${time}:00Z`);
  endDate.setUTCMinutes(endDate.getUTCMinutes() + minutes);
  const end = endDate.toISOString().slice(0, 16).replace(/[-:]/g, "") + "00";
  const desc = [`Prospecto Snodic: ${p.name}`, p.phone && `Tel: ${p.phone}`, p.google_maps_url].filter(Boolean).join("\n");
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Snodic//Mapping//ES",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:snodic-${id}-${start}@snodic-mapping`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART;TZID=Europe/Madrid:${start}`,
    `DTEND;TZID=Europe/Madrid:${end}`,
    `SUMMARY:${esc(`Reunión · ${p.name}`)}`,
    `DESCRIPTION:${esc(desc)}`,
    p.address ? `LOCATION:${esc(p.address)}` : "",
    "BEGIN:VALARM",
    "TRIGGER:-PT30M",
    "ACTION:DISPLAY",
    "DESCRIPTION:Reunión Snodic",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="reunion-${id}.ics"`,
    },
  });
}
