"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { useT } from "@/lib/i18n/client";
import { moveStageAction } from "@/app/crm-actions";
import { WhatsAppButton } from "@/app/whatsapp-button";

export type BoardCard = {
  id: number;
  name: string;
  stage: string;
  locality: string | null;
  score: number | null;
  assigned: string | null;
  waHref: string | null;
  hasMessage: boolean;
};

type Stage = { key: string; label: string };

const MIME = "application/x-snodic-card";

/**
 * Tablero del pipeline con arrastrar y soltar.
 * - Mueve la tarjeta al instante (optimista) y actualiza los contadores de las columnas.
 * - En el servidor aplica la etapa con su lógica (fecha de contacto, seguimiento, historial, métricas).
 * - Si el servidor falla, la tarjeta vuelve a su columna.
 * - En el celular (sin arrastre) se usa el selector de etapa de cada tarjeta.
 */
export function Board({ stages, cards: initial, totals: initialTotals }: { stages: Stage[]; cards: BoardCard[]; totals: Record<string, number> }) {
  const t = useT();
  const router = useRouter();
  const [cards, setCards] = useState(initial);
  const [totals, setTotals] = useState(initialTotals);
  const [over, setOver] = useState<string | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [, start] = useTransition();
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Cuando el servidor devuelve datos nuevos (refresh), se sincroniza el estado local.
  useEffect(() => {
    setCards(initial);
    setTotals(initialTotals);
  }, [initial, initialTotals]);

  const label = (key: string) => t(stages.find((s) => s.key === key)?.label ?? key);

  const notify = (text: string, error = false) => {
    setToast({ text, error });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  };

  const move = (id: number, to: string) => {
    const card = cards.find((c) => c.id === id);
    if (!card || card.stage === to) return;
    const from = card.stage;
    const prevCards = cards;
    const prevTotals = totals;
    setCards((cs) => cs.map((c) => (c.id === id ? { ...c, stage: to } : c)));
    setTotals((tt) => ({ ...tt, [from]: Math.max(0, (tt[from] ?? 1) - 1), [to]: (tt[to] ?? 0) + 1 }));
    start(async () => {
      const res = await moveStageAction(id, to);
      if (!res.ok) {
        setCards(prevCards);
        setTotals(prevTotals);
        notify(t("No se pudo mover: {e}", { e: res.error ?? "" }), true);
        return;
      }
      notify(t("{name} → {stage}", { name: card.name, stage: label(to) }));
      router.refresh();
    });
  };

  return (
    <>
      <div className="kanban">
        {stages.map((s) => {
          const list = cards
            .filter((c) => c.stage === s.key)
            .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.id - b.id);
          const total = totals[s.key] ?? 0;
          return (
            <section
              key={s.key}
              className={`kanban-col ${over === s.key ? "drop-over" : ""}`}
              onDragOver={(e) => {
                // Se acepta solo lo que viene de una tarjeta del tablero (no depende del estado de React).
                if (!e.dataTransfer.types.includes(MIME)) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (over !== s.key) setOver(s.key);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const id = Number(e.dataTransfer.getData(MIME));
                setOver(null);
                setDragId(null);
                if (id) move(id, s.key);
              }}
            >
              <header>
                <strong>{t(s.label)}</strong>
                <span className="badge muted">{total}</span>
              </header>
              {list.map((c) => (
                <article
                  key={c.id}
                  className={`kanban-card ${dragId === c.id ? "dragging" : ""}`}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(MIME, String(c.id));
                    e.dataTransfer.effectAllowed = "move";
                    // Cambiar el DOM durante dragstart puede cancelar el arrastre: se marca en el próximo ciclo.
                    setTimeout(() => setDragId(c.id), 0);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setOver(null);
                  }}
                  title={t("Arrastrá la tarjeta a otra columna para cambiar la etapa")}
                >
                  <div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
                    <Link href={`/prospectos/${c.id}`} draggable={false}>
                      <strong>{c.name}</strong>
                    </Link>
                    {c.score !== null && (
                      <span className={`badge ${c.score >= 60 ? "ok" : c.score >= 35 ? "warn" : "muted"}`}>{c.score}</span>
                    )}
                  </div>
                  <div className="help">
                    {c.locality ?? "-"} · {c.assigned ?? t("sin asignar")}
                  </div>
                  {c.stage === "to_contact" && c.hasMessage && (
                    <div style={{ marginTop: 6 }}>
                      <WhatsAppButton prospectId={c.id} href={c.waHref} kind="first" label={t("WhatsApp")} />
                    </div>
                  )}
                  <select
                    className="stage-select"
                    value={c.stage}
                    aria-label={t("Mover a etapa")}
                    onChange={(e) => move(c.id, e.target.value)}
                  >
                    {stages.map((x) => (
                      <option key={x.key} value={x.key}>{t(x.label)}</option>
                    ))}
                  </select>
                </article>
              ))}
              {list.length === 0 && <div className="kanban-empty">{t("Soltá aquí")}</div>}
              {total > list.length && <div className="help">{t("+{n} más en Prospectos", { n: total - list.length })}</div>}
            </section>
          );
        })}
      </div>
      {toast && (
        <div className={`toast ${toast.error ? "toast-err" : ""}`} role="status">
          {toast.text}
        </div>
      )}
    </>
  );
}
