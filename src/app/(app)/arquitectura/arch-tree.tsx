"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import { ARCH, ARCH_FLOW, ARCH_ROOT, type ArchAgent } from "@/lib/architecture";

/**
 * Árbol radial de la arquitectura: centro = app, primer anillo = agentes, anillo exterior = procesos.
 * Zoom con rueda, pellizco o botones; arrastrar para mover; clic en un nodo lleva a su página.
 * Las partículas que viajan por las ramas representan el trabajo que pasa de un agente a sus procesos.
 */
const R1 = 245;
const R2 = 430;
const VB = 610;
const MIN_K = 0.5;
const MAX_K = 5;

type View = { k: number; x: number; y: number };
const HOME: View = { k: 1, x: 0, y: 0 };

const polar = (r: number, a: number) => [r * Math.cos(a), r * Math.sin(a)] as const;
const deg = (a: number) => (a * 180) / Math.PI;

type Leaf = { agent: ArchAgent; label: string; href: string; desc: string; a: number; id: string };
type Branch = { agent: ArchAgent; a: number; leaves: Leaf[] };

function layout(): Branch[] {
  // Cada rama ocupa al menos 2,4 lugares (para que los agentes de un solo proceso no se amontonen) + 0,9 de hueco.
  const width = (ag: ArchAgent) => Math.max(ag.processes.length, 2.4) + 0.9;
  const step = (2 * Math.PI) / ARCH.reduce((s, ag) => s + width(ag), 0);
  let i = 0;
  return ARCH.map((agent) => {
    const w = width(agent) - 0.9;
    const n = agent.processes.length;
    const leaves = agent.processes.map((p, j) => ({ ...p, agent, a: -Math.PI / 2 + (i + (w - n) / 2 + j + 0.5) * step, id: `${agent.key}-${j}` }));
    i += width(agent);
    const a = leaves.reduce((s, l) => s + l.a, 0) / leaves.length;
    return { agent, a, leaves };
  });
}

const rootLink = (a: number) => {
  const [x, y] = polar(R1, a);
  const [cx, cy] = polar(R1 * 0.55, a - 0.18);
  return `M0 0 Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`;
};
const leafLink = (a0: number, a1: number) => {
  const [x0, y0] = polar(R1, a0);
  const m = (R1 + R2) / 2;
  const [c1x, c1y] = polar(m, a0);
  const [c2x, c2y] = polar(m, a1);
  const [x1, y1] = polar(R2 - 8, a1);
  return `M${x0.toFixed(1)} ${y0.toFixed(1)} C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
};
const flowLink = (a0: number, a1: number) => {
  const [x0, y0] = polar(R1 - 26, a0);
  const [x1, y1] = polar(R1 - 26, a1);
  let mid = (a0 + a1) / 2;
  if (Math.abs(a1 - a0) > Math.PI) mid += Math.PI;
  const [cx, cy] = polar(R1 * 0.5, mid);
  return `M${x0.toFixed(1)} ${y0.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
};
const colorStyle = (ag: ArchAgent) => ({ "--h": ag.hue } as React.CSSProperties);

export function ArchTree() {
  const t = useT();
  const router = useRouter();
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<View>(HOME);
  const [focus, setFocus] = useState<string | null>(null);
  const [hover, setHover] = useState<{ title: string; desc: string; href: string } | null>(null);
  const [motion, setMotion] = useState(false);
  const moved = useRef(0);
  const branches = useMemo(layout, []);
  const byKey = useMemo(() => new Map(branches.map((b) => [b.agent.key, b])), [branches]);

  useEffect(() => {
    try {
      setMotion(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch {
      setMotion(true);
    }
  }, []);

  /** Pasa un punto de pantalla a coordenadas del dibujo (sin el zoom aplicado). */
  const toSvg = useCallback((cx: number, cy: number) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = cx;
    pt.y = cy;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: p.x, y: p.y };
  }, []);

  const zoomAt = useCallback((factor: number, px = 0, py = 0) => {
    setView((v) => {
      const k = Math.min(MAX_K, Math.max(MIN_K, v.k * factor));
      const f = k / v.k;
      return { k, x: px - (px - v.x) * f, y: py - (py - v.y) * f };
    });
  }, []);

  // Rueda: zoom hacia el cursor (listener no pasivo para que no se mueva la página).
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = toSvg(e.clientX, e.clientY);
      zoomAt(Math.exp(-e.deltaY * 0.0015), p.x, p.y);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [toSvg, zoomAt]);

  // Arrastrar con mouse o un dedo; pellizcar con dos dedos.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, toSvg(e.clientX, e.clientY));
    moved.current = 0;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const cur = toSvg(e.clientX, e.clientY);
    if (pointers.current.size === 1) {
      const dx = cur.x - prev.x;
      const dy = cur.y - prev.y;
      moved.current += Math.abs(dx) + Math.abs(dy);
      if (moved.current > 4) setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
    } else if (pointers.current.size === 2) {
      const [other] = [...pointers.current.entries()].filter(([id]) => id !== e.pointerId).map(([, p]) => p);
      const d0 = Math.hypot(prev.x - other.x, prev.y - other.y);
      const d1 = Math.hypot(cur.x - other.x, cur.y - other.y);
      if (d0 > 0) zoomAt(d1 / d0, (cur.x + other.x) / 2, (cur.y + other.y) / 2);
      moved.current += 10;
    }
    pointers.current.set(e.pointerId, cur);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
  };

  const go = (href: string) => {
    if (moved.current > 6) return; // fue un arrastre, no un clic
    router.push(href);
  };
  const center = (key: string | null) => {
    setFocus(key);
    if (!key) return setView(HOME);
    const b = byKey.get(key)!;
    const [x, y] = polar((R1 + R2) / 2, b.a);
    const k = 1.9;
    setView({ k, x: -x * k, y: -y * k });
  };
  const keyNav = (e: React.KeyboardEvent, href: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      router.push(href);
    }
  };

  const showLabels = view.k >= 0.75;

  return (
    <div className="arch">
      <div className="arch-stage">
        <div className="arch-tools">
          <button type="button" className="btn secondary sm" onClick={() => zoomAt(1.3)} aria-label={t("Acercar")}>＋</button>
          <button type="button" className="btn secondary sm" onClick={() => zoomAt(1 / 1.3)} aria-label={t("Alejar")}>－</button>
          <button type="button" className="btn secondary sm" onClick={() => center(null)}>{t("Ver todo")}</button>
          <span className="help" style={{ margin: 0 }}>{Math.round(view.k * 100)}%</span>
        </div>
        <svg
          ref={svgRef}
          className={`arch-svg ${focus ? "has-focus" : ""}`}
          viewBox={`${-VB} ${-VB} ${VB * 2} ${VB * 2}`}
          role="img"
          aria-label={t("Árbol de agentes y procesos de la app")}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            {/* Anillos guía */}
            <circle r={R1} className="arch-ring" />
            <circle r={R2} className="arch-ring" />

            {/* Flujo del pipeline diario entre agentes */}
            <g className="arch-flow">
              {ARCH_FLOW.map(([from, to]) => {
                const a = byKey.get(from)!;
                const b = byKey.get(to)!;
                return <path key={from + to} d={flowLink(a.a, b.a)} className="arch-flow-path" markerEnd="url(#arch-arrow)" />;
              })}
            </g>

            {branches.map((b) => {
              const ag = b.agent;
              const [ax, ay] = polar(R1, b.a);
              const dim = focus && focus !== ag.key;
              const d0 = rootLink(b.a);
              return (
                <g
                  key={ag.key}
                  className={`arch-branch ${ag.hue < 0 ? "neutral" : ""} ${dim ? "dim" : ""} ${focus === ag.key ? "on" : ""}`}
                  style={colorStyle(ag)}
                >
                  <path d={d0} className="arch-link main" />
                  {b.leaves.map((l) => (
                    <path key={l.id} d={leafLink(b.a, l.a)} className="arch-link" />
                  ))}
                  {motion && (
                    <>
                      <circle r={3.4} className="arch-dot">
                        <animateMotion dur="3.2s" repeatCount="indefinite" path={d0} begin={`${(Number(ag.n) || 13) * 0.23}s`} />
                      </circle>
                      {b.leaves.map((l, j) => (
                        <circle key={l.id} r={2.6} className="arch-dot">
                          <animateMotion dur="2.6s" repeatCount="indefinite" path={leafLink(b.a, l.a)} begin={`${1 + j * 0.45 + (Number(ag.n) || 13) * 0.11}s`} />
                        </circle>
                      ))}
                    </>
                  )}

                  {/* Procesos */}
                  {b.leaves.map((l) => {
                    const [x, y] = polar(R2, l.a);
                    const right = Math.cos(l.a) >= 0;
                    const rot = right ? deg(l.a) : deg(l.a) + 180;
                    return (
                      <g
                        key={l.id}
                        className="arch-leaf"
                        tabIndex={0}
                        role="link"
                        aria-label={`${t(l.label)}: ${t(l.desc)}`}
                        onClick={() => go(l.href)}
                        onKeyDown={(e) => keyNav(e, l.href)}
                        onMouseEnter={() => setHover({ title: t(l.label), desc: t(l.desc), href: l.href })}
                        onMouseLeave={() => setHover(null)}
                        onFocus={() => setHover({ title: t(l.label), desc: t(l.desc), href: l.href })}
                      >
                        <circle cx={x} cy={y} r={8} className="arch-leaf-dot" />
                        {showLabels && (
                          <text
                            transform={`translate(${x} ${y}) rotate(${rot})`}
                            x={right ? 14 : -14}
                            dy="0.35em"
                            textAnchor={right ? "start" : "end"}
                            className="arch-label"
                          >
                            {t(l.label)}
                          </text>
                        )}
                      </g>
                    );
                  })}

                  {/* Agente */}
                  <g
                    className="arch-agent"
                    tabIndex={0}
                    role="link"
                    aria-label={`${t("Agente")} ${ag.n}: ${t(ag.label)}`}
                    onClick={() => go(ag.href)}
                    onKeyDown={(e) => keyNav(e, ag.href)}
                    onMouseEnter={() => setHover({ title: `${/^\d+$/.test(ag.n) ? `${t("Agente")} ${ag.n} · ` : ""}${t(ag.label)}`, desc: t("{n} procesos", { n: ag.processes.length }), href: ag.href })}
                    onMouseLeave={() => setHover(null)}
                  >
                    <circle cx={ax} cy={ay} r={23} className="arch-agent-dot" />
                    <text x={ax} y={ay} dy="0.36em" textAnchor="middle" className="arch-agent-n">{ag.n}</text>
                    {showLabels && (
                      <text x={ax} y={ay + 38} textAnchor="middle" className="arch-label strong">
                        {t(ag.label)}
                      </text>
                    )}
                  </g>
                </g>
              );
            })}

            {/* Raíz */}
            <g className="arch-root" tabIndex={0} role="link" aria-label={ARCH_ROOT.label} onClick={() => go(ARCH_ROOT.href)} onKeyDown={(e) => keyNav(e, ARCH_ROOT.href)}>
              <circle r={46} className="arch-root-dot" />
              <text dy="-0.15em" textAnchor="middle" className="arch-root-t">Snodic</text>
              <text dy="1.2em" textAnchor="middle" className="arch-root-s">Mapping</text>
            </g>
          </g>
          <defs>
            <marker id="arch-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M0 0 10 5 0 10z" className="arch-arrow" />
            </marker>
          </defs>
        </svg>
        <div className="arch-info" aria-live="polite">
          {hover ? (
            <>
              <strong>{hover.title}</strong> <span className="help" style={{ margin: 0 }}>{hover.desc}</span>
              <span className="arch-go">{t("Clic para abrir")} → {hover.href}</span>
            </>
          ) : (
            <span className="help" style={{ margin: 0 }}>{t("Rueda o pellizco para hacer zoom · arrastrá para moverte · clic en un nodo para ir a su página")}</span>
          )}
        </div>
      </div>

      <aside className="arch-legend">
        <strong>{t("Agentes")}</strong>
        <button type="button" className={`arch-legend-item ${focus === null ? "on" : ""}`} onClick={() => center(null)}>
          <i className="arch-swatch all" /> {t("Todos")}
        </button>
        {ARCH.map((ag) => (
          <button
            type="button"
            key={ag.key}
            className={`arch-legend-item ${ag.hue < 0 ? "neutral" : ""} ${focus === ag.key ? "on" : ""}`}
            style={colorStyle(ag)}
            onClick={() => center(focus === ag.key ? null : ag.key)}
          >
            <i className="arch-swatch" />
            <span className="arch-legend-n">{ag.n}</span> {t(ag.label)}
          </button>
        ))}
        <p className="help">
          <svg width="34" height="10" aria-hidden><path d="M2 5h28" className="arch-flow-path" markerEnd="url(#arch-arrow)" /></svg>{" "}
          {t("Flujo del pipeline diario entre agentes")}
        </p>
      </aside>
    </div>
  );
}
