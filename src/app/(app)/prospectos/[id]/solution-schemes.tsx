"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { edgePath, type Scheme, type SchemeIcon } from "@/lib/schemes";

/**
 * Esquemas de solución animados (mismo lenguaje visual que "Qué hacemos" en la web de Snodic):
 * nodos de vidrio, los de Snodic con insignia y destellos, cables que se dibujan y pulsos de energía.
 * Un esquema por idea del Agente 4; pasan solos, se pausan y se navegan con flechas, teclado o deslizando.
 */
const STEP_MS = 6500;

const ICON: Record<SchemeIcon, string> = {
  whatsapp: "M3 21l1.6-4.6A8.5 8.5 0 1 1 8 19.8zM9 8.5c0 3.5 3 6.5 6.5 6.5l1-1.6-2.2-1-1 1a5 5 0 0 1-2.7-2.7l1-1-1-2.2z",
  web: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z",
  phone: "M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z",
  mail: "M3 6h18v12H3zM3 7l9 6 9-6",
  instagram: "M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4zM12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM17.5 6.5h.01",
  google: "M20.5 12.2c0-.6-.1-1.2-.2-1.7H12v3.3h4.8a4.2 4.2 0 0 1-1.8 2.7v2.2h2.9c1.7-1.5 2.6-3.8 2.6-6.5zM12 21c2.4 0 4.5-.8 5.9-2.2L15 16.6c-.8.5-1.8.9-3 .9a5.3 5.3 0 0 1-5-3.6H4v2.3A9 9 0 0 0 12 21zM7 13.9a5.3 5.3 0 0 1 0-3.8V7.8H4a9 9 0 0 0 0 8.4zM12 6.5c1.3 0 2.5.5 3.4 1.3l2.6-2.6A9 9 0 0 0 4 7.8l3 2.3a5.3 5.3 0 0 1 5-3.6z",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z",
  qr: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z",
  user: "M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c.8-4.2 4-6.5 8-6.5s7.2 2.3 8 6.5",
  bolt: "M13 2 4 14h7l-1 8 9-12h-7z",
  chat: "M4 5h16v11H8l-4 4zM8 9h8M8 12h5",
  form: "M6 3h12v18H6zM9 7h6M9 11h6M9 15h4",
  bell: "M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0",
  check: "M4 6h3M4 12h3M4 18h3M10 6h10M10 12h10M10 18h10",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2",
  key: "M14.5 3a6.5 6.5 0 0 1-5.6 9.8L3 18.7V21h3v-2h2v-2h2l1.2-1.2A6.5 6.5 0 1 1 14.5 3zM16.5 7.5h.01",
  calendar: "M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 10h16M8 3v4M16 3v4",
  card: "M3 6h18v12H3zM3 10h18M7 15h3",
  poll: "M5 20V10M12 20V4M19 20v-7",
  bot: "M5 8h14v11H5zM12 4v4M9 13h.01M15 13h.01M9.5 16.5h5",
  doc: "M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6",
  chart: "M3 20h18M6 16v-5M11 16V7M16 16v-8M21 16v-3",
  bed: "M3 18v-7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v7M3 14h18M7 9V6h4v3",
  smile: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8.5 14a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01",
  gear: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1",
};

const SPARKS = [
  [-6, 18, 0], [104, 26, 0.6], [22, -38, 1.1], [84, 132, 0.3], [64, -44, 1.5], [-2, 112, 0.9],
];

function Ico({ name }: { name: SchemeIcon }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={ICON[name]} />
    </svg>
  );
}

export function SolutionSchemes({ schemes }: { schemes: Scheme[] }) {
  const t = useT();
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [tick, setTick] = useState(0); // reinicia la barra de progreso
  const [vertical, setVertical] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const down = useRef<number | null>(null);
  const n = schemes.length;

  const go = useCallback((k: number) => {
    setI(((k % n) + n) % n);
    setTick((x) => x + 1);
  }, [n]);

  useEffect(() => {
    try {
      setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch {}
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.4 });
    // En pantallas angostas el esquema se dibuja de arriba hacia abajo.
    const ro = new ResizeObserver(([e]) => setVertical(e.contentRect.width < 620));
    if (ref.current) {
      io.observe(ref.current);
      ro.observe(ref.current);
    }
    return () => {
      io.disconnect();
      ro.disconnect();
    };
  }, []);

  const running = !paused && visible && !reduced && n > 1;
  useEffect(() => {
    if (!running) return;
    const id = window.setTimeout(() => go(i + 1), STEP_MS);
    return () => window.clearTimeout(id);
  }, [running, i, tick, go]);

  if (!n) return null;
  const s = schemes[i];
  const byId = new Map(s.nodes.map((x) => [x.id, x]));

  return (
    <div className="schemes" ref={ref} style={{ "--ex": s.color } as React.CSSProperties}>
      <div
        className={`sch-scene ${vertical ? "vertical" : ""}`}
        role="group"
        aria-roledescription={t("carrusel")}
        aria-label={t("Esquema {a} de {b}: {name}", { a: i + 1, b: n, name: s.title })}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") go(i + 1);
          if (e.key === "ArrowLeft") go(i - 1);
        }}
        onPointerDown={(e) => (down.current = e.clientX)}
        onPointerUp={(e) => {
          if (down.current === null || n < 2) return;
          const dx = e.clientX - down.current;
          down.current = null;
          if (Math.abs(dx) > 40) return go(dx < 0 ? i + 1 : i - 1);
          const r = e.currentTarget.getBoundingClientRect();
          go(e.clientX < r.left + r.width / 2 ? i - 1 : i + 1);
        }}
      >
        <div className="sch-grid" aria-hidden />
        <div className="sch-ex on" key={`${i}-${vertical}`}>
          <svg className="sch-wires" viewBox={vertical ? "0 0 100 125" : "0 0 250 100"} preserveAspectRatio="none" aria-hidden>
            <g className="sch-edges">
              {s.edges.map(([a, b]) => (
                <path key={a + b} d={edgePath(byId.get(a)!, byId.get(b)!, vertical)} pathLength={100} />
              ))}
            </g>
            <g className="sch-pulses">
              {s.edges.map(([a, b], k) => (
                <path key={a + b} d={edgePath(byId.get(a)!, byId.get(b)!, vertical)} pathLength={100} style={{ animationDelay: `${-k * 0.55}s` }} />
              ))}
            </g>
          </svg>
          {s.nodes.map((nd, k) => (
            <div
              key={nd.id}
              className={`sch-n ${nd.sol ? "is-sol" : ""}`}
              style={{ left: `${vertical ? nd.y : nd.x}%`, top: `${vertical ? nd.x : nd.y}%`, "--n": k } as React.CSSProperties}
            >
              <span className="sch-ic"><Ico name={nd.icon} /></span>
              <span>{t(nd.label)}</span>
              {nd.sol && (
                <>
                  <span className="sch-badge" title={t("Lo integra Snodic")}>
                    <img src="/logo.png" alt="" width={22} height={22} />
                  </span>
                  <span className="sch-sparks" aria-hidden>
                    {SPARKS.map(([l, tp, d], j) => (
                      <i key={j} style={{ left: `${l}%`, top: `${tp}%`, animationDelay: `${d}s` }} />
                    ))}
                  </span>
                </>
              )}
            </div>
          ))}
        </div>
        {n > 1 && <span className="sch-hint">{t("Tocá a la derecha para avanzar o a la izquierda para volver")}</span>}
      </div>

      <div className="sch-caption">
        <span className="sch-cap-ic"><Ico name={s.nodes[1].icon} /></span>
        <strong>{t("Idea {n}", { n: i + 1 })} · {s.title}</strong>
        {n > 1 && (
          <span className="sch-dots" aria-hidden>
            {schemes.map((_, k) => <i key={k} className={k === i ? "on" : ""} />)}
          </span>
        )}
      </div>

      <div className="sch-nav">
        <button type="button" className="sch-btn" onClick={() => go(i - 1)} disabled={n < 2} aria-label={t("Anterior")}>←</button>
        <div className="sch-progress">
          {schemes.map((_, k) => (
            <button
              type="button"
              key={k}
              aria-label={t("Idea {n}", { n: k + 1 })}
              className={`${k < i ? "done" : ""} ${k === i ? (running ? "run" : "done") : ""}`}
              onClick={() => go(k)}
            >
              <i key={k === i ? tick : 0} style={{ animationDuration: `${STEP_MS}ms` }} />
            </button>
          ))}
        </div>
        {!reduced && n > 1 && (
          <button type="button" className="sch-btn" onClick={() => setPaused((p) => !p)} aria-pressed={paused} aria-label={paused ? t("Reanudar") : t("Pausar")}>
            {paused ? "▶" : "❚❚"}
          </button>
        )}
        <button type="button" className="sch-btn primary" onClick={() => go(i + 1)} disabled={n < 2} aria-label={t("Siguiente")}>→</button>
      </div>

      <div className="sch-text">
        <div><span className="sch-k">{t("Problema")}</span><p>{s.problem || "-"}</p></div>
        <div><span className="sch-k">{t("Solución")}</span><p>{s.solution || "-"}</p></div>
        <div><span className="sch-k">{t("Impacto")}</span><p>{s.impact || "-"}</p></div>
      </div>
    </div>
  );
}
