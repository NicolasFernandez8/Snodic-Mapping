import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auditBySlug, parseReport, recordAuditView } from "@/lib/audit";
import { getSetting } from "@/lib/db";
import { NodeNetwork } from "@/app/node-network";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Análisis gratuito · Snodic", robots: { index: false, follow: false } };

/** Mini-auditoría pública (sin login). Solo existe si alguien del equipo la publicó. */
export default async function Audit({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[A-Za-z0-9_-]{6,16}$/.test(slug)) notFound();
  const a = await auditBySlug(slug);
  if (!a) notFound();
  const ideas = a.report ? parseReport(a.report) : [];
  if (!ideas.length) notFound();
  await recordAuditView(a.id, a.name);
  const wa = await getSetting<string>("contact_whatsapp", "");
  const waLink = wa
    ? `https://wa.me/${wa}?text=${encodeURIComponent("Hola Nico! Vi el análisis que nos preparaste y me gustaría hablarlo.")}`
    : null;

  return (
    <div className="audit">
      <header className="audit-hero">
        <NodeNetwork className="node-hero" density={0.8} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Snodic" />
        <p className="audit-kicker">Análisis gratuito de reseñas</p>
        <h1>{a.name}</h1>
        <p className="audit-sub">
          Revisamos lo que dicen vuestros huéspedes en Google y encontramos 2 oportunidades concretas para conseguir más
          reservas y ahorrar tiempo al equipo.
        </p>
      </header>
      <main className="audit-body">
        {ideas.map((i, n) => (
          <section key={n} className="card audit-card">
            <span className="badge">Oportunidad {n + 1}</span>
            <h2>Lo que vimos</h2>
            <p>{i.problem}</p>
            <h2>Qué haríamos</h2>
            <p>{i.solution}</p>
            {i.impact && (
              <>
                <h2>Qué ganáis</h2>
                <p>{i.impact}</p>
              </>
            )}
          </section>
        ))}
        <section className="card audit-card" style={{ textAlign: "center" }}>
          <h2 style={{ marginTop: 0 }}>La primera etapa es gratuita</h2>
          <p>Analizamos vuestro caso en detalle y, si podemos aportar valor, os proponemos una prueba sin compromiso.</p>
          {waLink && (
            <a className="btn" style={{ background: "#25d366" }} href={waLink}>
              Hablar por WhatsApp
            </a>
          )}
        </section>
        <p className="help" style={{ textAlign: "center" }}>Snodic Consulting · Este análisis se basa en reseñas públicas.</p>
      </main>
    </div>
  );
}
