import { q } from "@/lib/db";
import { apiUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

// Mismas columnas que la base de Notion de Snodic (+ mensaje e informe).
const COLS = [
  ["name", "Name"],
  ["business_days", "Business Days"],
  ["business_hours", "Business Hours"],
  ["rating", "Rating - Google Maps"],
  ["locality", "Location"],
  ["website", "Webpage"],
  ["phone", "Phone"],
  ["address", "Address"],
  ["contact_info", "Contact Info"],
  ["region", "Area"],
  ["category", "Category"],
  ["email", "Email"],
  ["google_maps_url", "URL Google Maps"],
  ["status", "Estado"],
  ["message", "Mensaje"],
  ["report", "Informe"],
] as const;

const cell = (v: unknown) => {
  const s = v === null || v === undefined || v === "" ? "-" : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV (con "-" en datos vacíos) para importar en Notion o planillas. */
export async function GET() {
  const auth = await apiUser();
  if (auth instanceof Response) return auth;
  const rows = await q<Record<string, unknown>>(
    `SELECT p.*, l.name AS locality, r.name AS region,
       NULLIF(concat_ws(' [] ', NULLIF(p.instagram,''), NULLIF(p.facebook,'')), '') AS contact_info,
       (SELECT content FROM outputs o WHERE o.prospect_id = p.id AND o.kind = 'message' ORDER BY created_at DESC, id DESC LIMIT 1) AS message,
       (SELECT content FROM outputs o WHERE o.prospect_id = p.id AND o.kind = 'report' ORDER BY created_at DESC, id DESC LIMIT 1) AS report
     FROM prospects p LEFT JOIN localities l ON l.id = p.locality_id LEFT JOIN regions r ON r.id = l.region_id
     WHERE p.status <> 'discarded' ORDER BY r.position, l.name, p.name`,
  );
  const csv =
    "﻿" +
    [COLS.map((c) => c[1]).join(","), ...rows.map((r) => COLS.map(([k]) => cell(r[k])).join(","))].join("\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="snodic-prospectos-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
