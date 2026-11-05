import Link from "next/link";
import { notFound } from "next/navigation";
import { one, q } from "@/lib/db";
import { config } from "@/lib/config";
import { messagePrompt, reportPrompt } from "@/lib/ai/prompts";
import { latestOutput, promptInput, type OutputKind, type OutputRow } from "@/lib/agents/agent34-writer";
import {
  discardProspectAction,
  generateAction,
  saveOutputAction,
  saveReviewsAction,
  updateProspectAction,
} from "@/app/actions";
import { CopyButton } from "@/app/copy-button";
import { Badge, fmtDate, V } from "@/app/ui";

export const dynamic = "force-dynamic";

export default async function Prospecto({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const p = await one<{
    id: number;
    name: string;
    category: string | null;
    address: string | null;
    phone: string | null;
    website: string | null;
    email: string | null;
    instagram: string | null;
    facebook: string | null;
    business_days: string | null;
    business_hours: string | null;
    google_maps_url: string | null;
    reviews_url: string | null;
    rating: string | null;
    reviews_count: number | null;
    status: string;
    source: string;
    notion_page_id: string | null;
    notion_synced_at: string | null;
    locality: string | null;
    region: string | null;
    created_at: string;
  }>(
    `SELECT p.*, l.name AS locality, r.name AS region FROM prospects p
     LEFT JOIN localities l ON l.id = p.locality_id LEFT JOIN regions r ON r.id = l.region_id WHERE p.id = $1`,
    [id],
  );
  if (!p) notFound();
  const [reviews, message, report, input] = await Promise.all([
    q<{ author: string | null; rating: number | null; text: string; published_at: string | null }>(
      "SELECT author, rating, text, published_at FROM reviews WHERE prospect_id = $1 ORDER BY published_at DESC NULLS LAST",
      [id],
    ),
    latestOutput(id, "message"),
    latestOutput(id, "report"),
    promptInput(id),
  ]);
  const manual = config().LLM_PROVIDER === "manual";
  const notionUrl = p.notion_page_id ? `https://www.notion.so/${p.notion_page_id.replace(/-/g, "")}` : null;

  return (
    <>
      <div className="page-head">
        <div>
          <p className="sub" style={{ margin: 0 }}>
            <Link href="/prospectos">← Prospectos</Link> · {p.region ?? "-"} › {p.locality ?? "-"}
          </p>
          <h1>{p.name}</h1>
          <div className="row" style={{ marginTop: 6 }}>
            <Badge status={p.status} />
            {notionUrl && <a href={notionUrl} target="_blank" rel="noreferrer">Abrir en Notion ↗</a>}
            {p.google_maps_url && <a href={p.google_maps_url} target="_blank" rel="noreferrer">Google Maps ↗</a>}
          </div>
        </div>
        <form action={discardProspectAction}>
          <input type="hidden" name="id" value={p.id} />
          {p.status === "discarded" ? (
            <><input type="hidden" name="restore" value="1" /><button className="btn secondary">Restaurar</button></>
          ) : (
            <button className="btn danger">Descartar</button>
          )}
        </form>
      </div>

      <div className="grid two" style={{ marginBottom: 16 }}>
        <div className="card">
          <h2>Datos (Agente 2)</h2>
          <dl className="dl">
            <dt>Categoría</dt><dd><V v={p.category} /></dd>
            <dt>Días</dt><dd><V v={p.business_days} /></dd>
            <dt>Horario</dt><dd><V v={p.business_hours} /></dd>
            <dt>Dirección</dt><dd><V v={p.address} /></dd>
            <dt>Rating</dt><dd>{p.rating ? `${p.rating}★ · ${p.reviews_count ?? 0} reseñas` : <V v={null} />}</dd>
            <dt>Reseñas</dt><dd><V v={p.reviews_url} href /></dd>
            <dt>Fuente</dt><dd>{p.source}</dd>
            <dt>Alta</dt><dd>{fmtDate(p.created_at)}</dd>
            <dt>Notion</dt><dd>{p.notion_synced_at ? `sincronizado ${fmtDate(p.notion_synced_at)}` : <V v={null} />}</dd>
          </dl>
          <form action={updateProspectAction} style={{ marginTop: 16 }}>
            <input type="hidden" name="id" value={p.id} />
            <p className="help" style={{ marginTop: 0 }}>Completá a mano lo que el agente no encontró (“-”).</p>
            <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
              {EDITABLE.map(([f, label, ph]) => (
                <div key={f}>
                  <label htmlFor={f}>{label}</label>
                  <input id={f} name={f} defaultValue={p[f] ?? ""} placeholder={ph} />
                </div>
              ))}
            </div>
            <button className="btn sm" style={{ marginTop: 10 }}>Guardar datos</button>
          </form>
        </div>

        <div className="card">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
            <h2 style={{ margin: 0 }}>Reseñas ({reviews.length})</h2>
            {p.google_maps_url && (
              <a className="btn secondary sm" href={p.reviews_url || p.google_maps_url} target="_blank" rel="noreferrer">
                Abrir en Google Maps ↗
              </a>
            )}
          </div>
          {reviews.length === 0 ? (
            <div className="empty">
              Sin reseñas. Abrí la ficha en Google Maps, copiá las reseñas y pegalas abajo: los agentes 3 y 4 las necesitan
              para no inventar datos.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10, maxHeight: 420, overflow: "auto" }}>
              {reviews.map((r, i) => (
                <div key={i} className="pre" style={{ padding: 10 }}>
                  <strong>{r.rating ? "★".repeat(r.rating) : ""}</strong> <span className="sub">{r.author ?? ""}</span>
                  <div>{r.text}</div>
                </div>
              ))}
            </div>
          )}
          <details style={{ marginTop: 12 }} open={reviews.length === 0}>
            <summary>Pegar reseñas</summary>
            <form action={saveReviewsAction} style={{ marginTop: 8 }}>
              <input type="hidden" name="id" value={p.id} />
              <textarea
                name="reviews"
                rows={7}
                placeholder={"5★ Habitaciones limpias y personal muy amable.\n\n2★ Nadie contesta el teléfono para reservar."}
              />
              <p className="help">Una reseña por bloque (dejá una línea vacía entre reseñas). Opcional: empezar con “5★”.</p>
              <div className="row">
                <button className="btn sm">Guardar reseñas</button>
                <label className="row" style={{ margin: 0, fontWeight: 500 }}>
                  <input type="checkbox" name="replace" style={{ width: "auto" }} /> Reemplazar las actuales
                </label>
              </div>
            </form>
          </details>
        </div>
      </div>

      <div className="grid two">
        <OutputCard
          title="Mensaje de WhatsApp (Agente 3)"
          kind="message"
          id={p.id}
          out={message}
          prompt={messagePrompt(input)}
          manual={manual}
        />
        <OutputCard
          title="Informe de oportunidades (Agente 4)"
          kind="report"
          id={p.id}
          out={report}
          prompt={reportPrompt(input)}
          manual={manual}
        />
      </div>
    </>
  );
}

const EDITABLE = [
  ["phone", "Phone", "34624207288"],
  ["email", "Email", "-"],
  ["website", "Webpage", "-"],
  ["instagram", "Instagram", "https://www.instagram.com/…"],
  ["facebook", "Facebook", "https://www.facebook.com/…"],
  ["business_days", "Business Days", "Lunes a Domingo"],
  ["business_hours", "Business Hours", "12:30 a 16:00"],
  ["rating", "Rating - Google", "4,9"],
] as const;

function OutputCard(props: {
  title: string;
  kind: OutputKind;
  id: number;
  out: OutputRow | null;
  prompt: string;
  manual: boolean;
}) {
  const { out } = props;
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
        <h2 style={{ margin: 0 }}>{props.title}</h2>
        {out && <Badge status={out.status} />}
      </div>
      {out?.issues?.length ? (
        <div className="notice">
          {out.issues.map((i) => (
            <div key={i}>• {i}</div>
          ))}
        </div>
      ) : null}
      {out?.content ? (
        <>
          <div className="pre">{out.content}</div>
          <div className="row" style={{ marginTop: 8 }}>
            <CopyButton text={out.content} />
            <span className="help">{out.model} · {fmtDate(out.created_at)}</span>
          </div>
        </>
      ) : (
        <div className="empty">
          {props.manual
            ? "Modo manual: copiá el prompt, pegalo en Claude y guardá la respuesta abajo."
            : "Todavía no se generó."}
        </div>
      )}
      <div className="row" style={{ marginTop: 12 }}>
        <CopyButton text={props.prompt} label="Copiar prompt" />
        {!props.manual && (
          <form action={generateAction}>
            <input type="hidden" name="id" value={props.id} />
            <input type="hidden" name="kind" value={props.kind} />
            <button className="btn sm">{out?.content ? "Regenerar" : "Generar"}</button>
          </form>
        )}
      </div>
      <details style={{ marginTop: 12 }}>
        <summary>{out?.content ? "Editar a mano" : "Pegar respuesta"}</summary>
        <form action={saveOutputAction} style={{ marginTop: 8 }}>
          <input type="hidden" name="id" value={props.id} />
          <input type="hidden" name="kind" value={props.kind} />
          <textarea name="content" defaultValue={out?.content ?? ""} rows={props.kind === "report" ? 16 : 9} />
          <button className="btn sm" style={{ marginTop: 8 }}>Guardar (revisión humana)</button>
        </form>
      </details>
    </div>
  );
}
