import { q } from "@/lib/db";

export const dynamic = "force-dynamic";

const COLS = [
  ["name", "Nombre"],
  ["region", "Zona"],
  ["locality", "Localidad"],
  ["category", "Categoría"],
  ["address", "Dirección"],
  ["phone", "Teléfono"],
  ["website", "Web"],
  ["email", "Email"],
  ["instagram", "Instagram"],
  ["google_maps_url", "Google Maps"],
  ["reviews_url", "Reseñas"],
  ["rating", "Rating"],
  ["reviews_count", "Nº reseñas"],
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
  const rows = await q<Record<string, unknown>>(
    `SELECT p.*, l.name AS locality, r.name AS region,
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
