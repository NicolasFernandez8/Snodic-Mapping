"use client";
import { useMemo, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";

/**
 * Gráficos del dashboard (SVG propio, sin librerías): dona, escalera (embudo), barras y área.
 * - Colores por rol: categórico en orden fijo (--series-1..5) y un solo tono para magnitudes (--blue).
 * - Animados al aparecer (respetan "reducir movimiento" vía CSS global).
 * - Tooltip al pasar el mouse; leyenda y valores visibles para no depender solo del color.
 */

type Tip = { x: number; y: number; title: string; lines: string[] } | null;

function useTip() {
  const [tip, setTip] = useState<Tip>(null);
  const box = useRef<HTMLDivElement>(null);
  const show = (e: React.MouseEvent, title: string, lines: string[]) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    setTip({ x: e.clientX - r.left, y: e.clientY - r.top, title, lines });
  };
  const hide = () => setTip(null);
  const node = tip ? (
    <div className="chart-tip" style={{ left: tip.x, top: tip.y }} role="tooltip">
      <strong>{tip.title}</strong>
      {tip.lines.map((l) => (
        <span key={l}>{l}</span>
      ))}
    </div>
  ) : null;
  return { box, show, hide, node };
}

function ChartHead({ title, actions }: { title: string; actions?: React.ReactNode }) {
  return (
    <div className="chart-head">
      <h3>{title}</h3>
      {actions}
    </div>
  );
}

const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)} %` : "-");

// ---------- Dona: prospectos por etapa ----------
export function Donut({ data, title, actions }: { data: { key: string; label: string; value: number; color: string }[]; title: string; actions?: React.ReactNode }) {
  const t = useT();
  const { box, show, hide, node } = useTip();
  const total = data.reduce((a, d) => a + d.value, 0);
  const R = 70, W = 22, C = 2 * Math.PI * R;
  const GAP = total > 0 && data.filter((d) => d.value > 0).length > 1 ? 2 : 0; // separación de 2px entre segmentos
  let acc = 0;
  return (
    <div className="chart-card" ref={box}>
      <ChartHead title={title} actions={actions} />
      <div className="donut-wrap">
        <svg viewBox="0 0 180 180" className="donut" role="img" aria-label={title}>
          <circle cx="90" cy="90" r={R} fill="none" stroke="var(--border)" strokeWidth={W} />
          {total > 0 &&
            data.map((d, i) => {
              if (!d.value) return null;
              const len = (d.value / total) * C;
              const seg = (
                <circle
                  key={d.key}
                  cx="90"
                  cy="90"
                  r={R}
                  fill="none"
                  stroke={d.color}
                  strokeWidth={W}
                  strokeDasharray={`${Math.max(0, len - GAP)} ${C}`}
                  strokeDashoffset={-acc}
                  transform="rotate(-90 90 90)"
                  className="donut-seg"
                  style={{ animationDelay: `${i * 0.08}s` }}
                  onMouseMove={(e) => show(e, d.label, [`${d.value} · ${pct(d.value, total)}`])}
                  onMouseLeave={hide}
                />
              );
              acc += len;
              return seg;
            })}
          <text x="90" y="86" textAnchor="middle" className="donut-total">{total}</text>
          <text x="90" y="106" textAnchor="middle" className="donut-sub">{t("prospectos")}</text>
        </svg>
        <ul className="legend-list">
          {data.map((d) => (
            <li key={d.key}>
              <i style={{ background: d.color }} />
              <span>{d.label}</span>
              <strong>{d.value}</strong>
              <span className="help">{pct(d.value, total)}</span>
            </li>
          ))}
        </ul>
      </div>
      {node}
    </div>
  );
}

// ---------- Escalera: embudo de conversión ----------
export function Staircase({ steps, title, actions }: { steps: { label: string; value: number }[]; title: string; actions?: React.ReactNode }) {
  const t = useT();
  const { box, show, hide, node } = useTip();
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <div className="chart-card" ref={box}>
      <ChartHead title={title} actions={actions} />
      <div className="stairs">
        {steps.map((s, i) => {
          const prev = i > 0 ? steps[i - 1].value : null;
          const w = Math.max(3, (100 * s.value) / max);
          return (
            <div key={s.label} className="stair" onMouseMove={(e) => show(e, s.label, [`${s.value}`, prev !== null ? t("{p} del paso anterior", { p: pct(s.value, prev) }) : ""].filter(Boolean))} onMouseLeave={hide}>
              <span className="stair-label">{s.label}</span>
              <div className="stair-track">
                <div className="stair-bar" style={{ width: `${w}%`, opacity: 1 - i * 0.12, animationDelay: `${i * 0.1}s` }} />
              </div>
              <span className="stair-val">
                <strong>{s.value}</strong>
                {prev !== null && <span className="help"> · {pct(s.value, prev)}</span>}
              </span>
            </div>
          );
        })}
      </div>
      {node}
    </div>
  );
}

// ---------- Barras verticales: por categoría ----------
export function Bars({ data, title, actions }: { data: { label: string; value: number; extra?: string }[]; title: string; actions?: React.ReactNode }) {
  const { box, show, hide, node } = useTip();
  const max = Math.max(1, ...data.map((d) => d.value));
  const H = 150;
  return (
    <div className="chart-card" ref={box}>
      <ChartHead title={title} actions={actions} />
      {data.length === 0 ? (
        <div className="empty">-</div>
      ) : (
        <div className="vbars" style={{ height: H + 44 }}>
          {data.map((d, i) => (
            <div key={d.label} className="vbar" onMouseMove={(e) => show(e, d.label, [String(d.value), d.extra ?? ""].filter(Boolean))} onMouseLeave={hide}>
              <span className="vbar-val">{d.value}</span>
              <div className="vbar-col" style={{ height: `${Math.max(2, (H * d.value) / max)}px`, animationDelay: `${i * 0.06}s` }} />
              <span className="vbar-label" title={d.label}>{d.label}</span>
            </div>
          ))}
        </div>
      )}
      {node}
    </div>
  );
}

// ---------- Área: actividad semanal (2 series, un solo eje) ----------
export function Activity({
  weeks,
  series,
  title,
  actions,
}: {
  weeks: string[];
  series: { name: string; color: string; values: number[] }[];
  title: string;
  actions?: React.ReactNode;
}) {
  const { box, show, hide, node } = useTip();
  const [hover, setHover] = useState<number | null>(null);
  const W = 560, H = 240, P = { l: 30, r: 12, t: 12, b: 26 };
  const raw = Math.max(1, ...series.flatMap((s) => s.values));
  const step = Math.max(1, Math.ceil(raw / 4));
  const max = step * Math.ceil(raw / step); // tope "redondo" para que la última línea de guía quede arriba
  const x = (i: number) => P.l + (weeks.length <= 1 ? 0 : (i * (W - P.l - P.r)) / (weeks.length - 1));
  const y = (v: number) => P.t + (H - P.t - P.b) * (1 - v / max);
  const ticks = useMemo(() => Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step), [max, step]);
  return (
    <div className="chart-card" ref={box}>
      <ChartHead title={title} actions={actions} />
      <ul className="legend-inline">
        {series.map((s) => (
          <li key={s.name}><i style={{ background: s.color }} />{s.name}</li>
        ))}
      </ul>
      <svg viewBox={`0 0 ${W} ${H}`} className="area-chart" role="img" aria-label={title}
        onMouseLeave={() => { setHover(null); hide(); }}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          const i = Math.max(0, Math.min(weeks.length - 1, Math.round(((px - P.l) / (W - P.l - P.r)) * (weeks.length - 1))));
          setHover(i);
          show(e, weeks[i], series.map((s) => `${s.name}: ${s.values[i]}`));
        }}>
        {ticks.map((tk) => (
          <g key={tk}>
            <line x1={P.l} x2={W - P.r} y1={y(tk)} y2={y(tk)} className="grid-line" />
            <text x={P.l - 6} y={y(tk) + 3} textAnchor="end" className="axis-text">{tk}</text>
          </g>
        ))}
        {weeks.map((w, i) =>
          weeks.length > 10 && i % 2 === 1 && i !== weeks.length - 1 ? null : (
            <text key={w} x={x(i)} y={H - 6} textAnchor="middle" className="axis-text">{w}</text>
          ),
        )}
        {series.map((s, si) => {
          const pts = s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
          const area = `M${x(0)},${y(0)} L${pts.replaceAll(" ", " L")} L${x(s.values.length - 1)},${y(0)} Z`;
          return (
            <g key={s.name}>
              <path d={area} fill={s.color} fillOpacity={0.14} className="area-fill" style={{ animationDelay: `${si * 0.15}s` }} />
              <polyline points={pts} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
                className="area-line" pathLength={1} style={{ animationDelay: `${si * 0.15}s` }} />
              {s.values.map((v, i) => (
                <circle key={i} cx={x(i)} cy={y(v)} r={hover === i ? 5 : 0} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
              ))}
            </g>
          );
        })}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={P.t} y2={H - P.b} className="crosshair" />}
      </svg>
      {node}
    </div>
  );
}
