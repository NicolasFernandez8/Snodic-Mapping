"use client";
import { useEffect, useRef } from "react";

/**
 * Fondo de nodos con la misma animación que la web oficial de Snodic (snodic-consulting.web.app):
 * - Estrellas que titilan, cada una vuelve a su lugar con un resorte suave.
 * - El cursor las aparta (radio 160 px) y, cerca de él (230 px), cada nodo se conecta con sus 2 vecinos
 *   más cercanos (< 120 px); las líneas se encienden y se apagan de a poco.
 * - Parte de los nodos "se resuelven": al quedar bien conectados se iluminan con el color de acento.
 * Colores tomados del tema de Mapping: --star (r, g, b) para los nodos y --done para el acento.
 * Respeta "reducir movimiento" y en pantallas táctiles solo titila (sin cursor).
 */
export function NodeNetwork({
  density = 1,
  interactive = true,
  className = "node-bg",
}: {
  density?: number;
  interactive?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const touch = window.matchMedia("(max-width: 768px), (pointer: coarse)").matches;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const still = touch || reduce || !interactive;

    const SPRING = 0.02;
    const DAMP = 0.86;
    const AREA = 4200 / density; // px² por nodo
    let W = 0, H = 0, running = false, raf = 0;
    let star = "243,232,242";
    let done = [240, 80, 143];
    let pointer: { x: number; y: number } | null = null;
    type Node = { hx: number; hy: number; x: number; y: number; vx: number; vy: number; r: number; p: number; s: number; v: number; solvable: boolean };
    let nodes: Node[] = [];
    let links = new Map<number, number>();
    const key = (a: number, b: number) => (a < b ? a * 1e5 + b : b * 1e5 + a);
    const mix = (t: number) => star.split(",").map(Number).map((c, i) => Math.round(c + (done[i] - c) * t)).join(",");

    const readColors = () => {
      const cs = getComputedStyle(document.documentElement);
      star = cs.getPropertyValue("--star").trim().replace(/\s+/g, "") || star;
      const d = cs.getPropertyValue("--done").trim().replace("#", "");
      if (d.length === 6) done = [0, 2, 4].map((i) => parseInt(d.slice(i, i + 2), 16));
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, touch ? 1.5 : 2);
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      links = new Map();
      nodes = Array.from({ length: Math.round((W * H) / (touch ? AREA * 1.6 : AREA)) }, () => {
        const x = Math.random() * W, y = Math.random() * H;
        return { hx: x, hy: y, x, y, vx: 0, vy: 0, r: Math.random() * 1.3 + 0.25, p: Math.random() * 6.28, s: Math.random() * 0.02 + 0.004, v: 0, solvable: Math.random() < 0.45 };
      });
    };

    // Conexiones cerca del cursor: cada nodo con sus 2 vecinos más próximos; aparecen y se desvanecen gradualmente.
    const updateLinks = () => {
      const active = new Set<number>();
      if (pointer) {
        const near: number[] = [];
        nodes.forEach((n, i) => {
          if (Math.hypot(n.x - pointer!.x, n.y - pointer!.y) < 230) near.push(i);
        });
        for (const i of near) {
          const a = nodes[i];
          near
            .filter((j) => j !== i)
            .map((j) => ({ j, d: Math.hypot(nodes[j].x - a.x, nodes[j].y - a.y) }))
            .filter((o) => o.d < 120)
            .sort((m, n) => m.d - n.d)
            .slice(0, 2)
            .forEach((o) => active.add(key(i, o.j)));
        }
      }
      for (const k of active) links.set(k, Math.min((links.get(k) ?? -0.25) + 0.007, 1));
      for (const [k, v] of links) {
        if (active.has(k)) continue;
        const nv = v - 0.0035;
        if (nv <= 0) links.delete(k);
        else links.set(k, nv);
      }
      const solid = new Set<number>();
      for (const [k, v] of links) {
        if (v < 0.85) continue;
        solid.add(Math.floor(k / 1e5));
        solid.add(k % 1e5);
      }
      nodes.forEach((n, i) => {
        if (n.solvable && solid.has(i)) n.v = Math.min(1, n.v + 0.012);
        else if (n.v > 0) n.v = Math.max(0, n.v - 0.00028);
      });
    };

    const drawLinks = () => {
      ctx.lineWidth = 0.6;
      for (const [k, v] of links) {
        if (v <= 0) continue;
        const a = nodes[Math.floor(k / 1e5)], b = nodes[k % 1e5];
        if (!a || !b) continue;
        const lit = Math.max(a.v, b.v);
        ctx.strokeStyle = `rgba(${lit > 0.01 ? mix(lit) : star},${(v * v * (0.3 + lit * 0.25)).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    };

    const drawStill = () => {
      ctx.clearRect(0, 0, W, H);
      for (const n of nodes) {
        ctx.fillStyle = `rgba(${star},${(0.35 + 0.45 * (0.5 + 0.5 * Math.sin(n.p))).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, 6.2832);
        ctx.fill();
      }
    };

    const frame = () => {
      if (still) {
        // Sin cursor: solo titilan (y en "reducir movimiento" quedan quietas).
        if (!reduce) for (const n of nodes) n.p += n.s;
        drawStill();
        return;
      }
      ctx.clearRect(0, 0, W, H);
      updateLinks();
      drawLinks();
      for (const n of nodes) {
        if (pointer) {
          const dx = n.x - pointer.x, dy = n.y - pointer.y, d = Math.hypot(dx, dy);
          if (d < 160 && d > 0.01) {
            const f = (1 - d / 160) ** 2 * 6;
            n.vx += (dx / d) * f;
            n.vy += (dy / d) * f;
          }
        }
        n.vx = (n.vx + (n.hx - n.x) * SPRING) * DAMP;
        n.vy = (n.vy + (n.hy - n.y) * SPRING) * DAMP;
        n.x += n.vx;
        n.y += n.vy;
        n.p += n.s;
        const drift = Math.min(Math.hypot(n.x - n.hx, n.y - n.hy) / 60, 0.35);
        const alpha = 0.22 + 0.5 * (0.5 + 0.5 * Math.sin(n.p)) + drift;
        if (n.v > 0.01) {
          const c = mix(n.v);
          ctx.fillStyle = `rgba(${c},${(0.18 * n.v).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r + 3.5 * n.v, 0, 6.2832);
          ctx.fill();
          ctx.fillStyle = `rgba(${c},${Math.min(1, alpha + 0.35 * n.v).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r + 0.6 * n.v, 0, 6.2832);
          ctx.fill();
        } else {
          ctx.fillStyle = `rgba(${star},${alpha.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r, 0, 6.2832);
          ctx.fill();
        }
      }
    };

    const loop = () => {
      if (!running) return;
      frame();
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (reduce || running || document.hidden) return;
      running = true;
      raf = requestAnimationFrame(loop);
    };

    readColors();
    resize();
    frame();
    start();

    // El cursor se mide relativo al canvas (sirve para el fondo, la barra lateral y la portada).
    const onPointer = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerType === "touch") pointer = null;
    };
    const onOut = (e: MouseEvent) => {
      if (!e.relatedTarget) pointer = null;
    };
    const onBlur = () => {
      pointer = null;
    };
    const onVis = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else start();
    };
    if (!still) {
      window.addEventListener("pointermove", onPointer, { passive: true });
      window.addEventListener("pointerdown", onPointer, { passive: true });
      window.addEventListener("pointerup", onUp);
      document.addEventListener("mouseout", onOut);
      window.addEventListener("blur", onBlur);
    }
    document.addEventListener("visibilitychange", onVis);
    let lastW = canvas.clientWidth, lastH = canvas.clientHeight;
    const ro = new ResizeObserver(() => {
      if (canvas.clientWidth !== lastW || canvas.clientHeight !== lastH) {
        lastW = canvas.clientWidth;
        lastH = canvas.clientHeight;
        resize();
        frame();
      }
    });
    ro.observe(canvas);
    const mo = new MutationObserver(() => {
      readColors();
      frame();
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onScheme = () => {
      readColors();
      frame();
    };
    mq.addEventListener("change", onScheme);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("pointerup", onUp);
      document.removeEventListener("mouseout", onOut);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVis);
      ro.disconnect();
      mo.disconnect();
      mq.removeEventListener("change", onScheme);
    };
  }, [density, interactive]);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
