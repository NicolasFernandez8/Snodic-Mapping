import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { requireUser } from "@/lib/auth/session";
import { q } from "@/lib/db";
import { emailLink, instagramProfile, UNSUBSCRIBE_LINE } from "@/lib/extras";
import { AltChannelButtons } from "@/app/alt-channel-buttons";
import { V } from "@/app/ui";

export const dynamic = "force-dynamic";

type Row = {
  id: number;
  name: string;
  locality: string | null;
  phone: string | null;
  phone_type: string | null;
  email: string | null;
  instagram: string | null;
  score: number | null;
  message: string | null;
};

/** Agente 9 · Canal alternativo: prospectos sin WhatsApp (sin móvil) que se pueden contactar por email o Instagram. */
export default async function Canal() {
  await requireUser();
  const t = await getT();
  const rows = await q<Row>(
    `SELECT p.id, p.name, l.name AS locality, p.phone, p.phone_type, p.email, p.instagram, p.score, o.content AS message
     FROM prospects p
     LEFT JOIN localities l ON l.id = p.locality_id
     LEFT JOIN LATERAL (
       SELECT content FROM outputs WHERE prospect_id = p.id AND kind = 'message' AND content IS NOT NULL
       ORDER BY created_at DESC, id DESC LIMIT 1
     ) o ON true
     WHERE NOT p.do_not_contact AND p.duplicate_of IS NULL AND p.status <> 'discarded' AND p.stage = 'to_contact'
       AND COALESCE(p.phone_type, 'unknown') <> 'mobile'
       AND (p.email IS NOT NULL OR p.instagram IS NOT NULL)
     ORDER BY (o.content IS NOT NULL) DESC, p.score DESC NULLS LAST, p.id
     LIMIT 100`,
  );
  const ready = rows.filter((r) => r.message);
  const waiting = rows.filter((r) => !r.message);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t("Canal alternativo")}</h1>
          <p className="sub">
            {t("Agente 9 · prospectos sin móvil (sin WhatsApp) que tienen email o Instagram. Revisás el mensaje y lo enviás vos; la app registra el contacto.")}
          </p>
        </div>
        <span className="badge">{t("{n} listos", { n: ready.length })}</span>
      </div>
      {rows.length === 0 ? (
        <div className="card empty">{t("No hay prospectos sin móvil con email o Instagram por contactar.")}</div>
      ) : (
        <>
          <div className="grid two">
            {ready.map((r) => {
              const text = `${r.message}\n\n${UNSUBSCRIBE_LINE}`;
              return (
                <div key={r.id} className="card alt-card">
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <Link href={`/prospectos/${r.id}`}><strong>{r.name}</strong></Link>
                    {r.score !== null && <span className="badge muted">{r.score}</span>}
                  </div>
                  <p className="help" style={{ margin: "4px 0 8px" }}>
                    <V v={r.locality} /> · {r.phone_type === "landline" ? t("Fijo · sin WhatsApp") : t("Sin teléfono móvil")}
                    {r.email && <> · ✉ {r.email}</>}
                    {r.instagram && <> · IG</>}
                  </p>
                  <div className="pre scroll-box" style={{ maxHeight: 180 }}>{text}</div>
                  <div style={{ marginTop: 10 }}>
                    <AltChannelButtons prospectId={r.id} mailto={emailLink(r.email, r.message!)} instagram={instagramProfile(r.instagram)} text={text} />
                  </div>
                </div>
              );
            })}
          </div>
          {waiting.length > 0 && (
            <div className="card" style={{ marginTop: 16 }}>
              <h2 style={{ marginTop: 0 }}>{t("Falta el mensaje ({n})", { n: waiting.length })}</h2>
              <p className="help" style={{ marginTop: 0 }}>{t("Generá el mensaje del Agente 3 (Prompts en lote o en la ficha) y aparecen arriba.")}</p>
              <div className="row" style={{ gap: 8 }}>
                {waiting.map((r) => (
                  <Link key={r.id} className="chip" href={`/prospectos/${r.id}`}>{r.name}</Link>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
