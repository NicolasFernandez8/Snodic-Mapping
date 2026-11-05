"use client";
import { useEffect, useRef } from "react";

/**
 * Fondo animado de nodos conectados (temática "Snodic" = nodos).
 * - Liviano: canvas 2D, cantidad de nodos según el tamaño de pantalla, DPR limitado a 2.
 * - Se pausa con la pestaña oculta y respeta "reducir movimiento" (dibuja una vez, sin animar).
 * - Toma los colores del tema (--blue = acento) y se actualiza al cambiar claro/oscuro.
 * - Los nodos cercanos al cursor se conectan con él.
 */
export function NodeNetwork({ density = 1, interactive = true, className = "node-bg" }: { density?: number; interactive?: boolean; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0, h = 0, dpr = 1, raf = 0, running = true;
    let color = "#c2337f";
    const mouse = { x: -9999, y: -9999 };
    type N = { x: number; y: number; vx: number; vy: number; r: number; hub: boolean };
    let nodes: N[] = [];

    const readColor = () => {
      color = getComputedStyle(document.documentElement).getPropertyValue("--blue").trim() || "#c2337f";
    };
    const rgba = (a: number) => {
      const c = color.replace("#", "");
      const n = parseInt(c.length === 3 ? c.split("").map((x) => x + x).join("") : c, 16);
      return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(Math.min(90, Math.max(24, (w * h) / 16000)) * density);
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        r: Math.random() * 1.6 + 1,
        hub: Math.random() < 0.08,
      }));
    };

    const LINK = 130;
    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      for (const n of nodes) {
        if (!reduce) {
          n.x += n.vx;
          n.y += n.vy;
          if (n.x < -20) n.x = w + 20;
          if (n.x > w + 20) n.x = -20;
          if (n.y < -20) n.y = h + 20;
          if (n.y > h + 20) n.y = -20;
        }
      }
      // líneas entre nodos cercanos
      ctx.lineWidth = 1;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < LINK * LINK) {
            ctx.strokeStyle = rgba(0.22 * (1 - Math.sqrt(d2) / LINK));
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
        // conexión con el cursor
        if (interactive) {
          const dx = a.x - mouse.x, dy = a.y - mouse.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 170) {
            ctx.strokeStyle = rgba(0.45 * (1 - d / 170));
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(mouse.x, mouse.y);
            ctx.stroke();
          }
        }
      }
      // nodos (los "hub" laten suavemente)
      for (const n of nodes) {
        const pulse = n.hub && !reduce ? 1 + 0.35 * Math.sin(t / 600 + n.x) : 1;
        if (n.hub) {
          ctx.fillStyle = rgba(0.12);
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r * 5 * pulse, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = rgba(n.hub ? 0.85 : 0.5);
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r * (n.hub ? 1.8 : 1), 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const loop = (t: number) => {
      if (!running) return;
      draw(t);
      raf = requestAnimationFrame(loop);
    };

    readColor();
    resize();
    if (reduce) draw(0);
    else raf = requestAnimationFrame(loop);

    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
    };
    const onLeave = () => {
      mouse.x = mouse.y = -9999;
    };
    const onVis = () => {
      running = document.visibilityState === "visible";
      if (running && !reduce) raf = requestAnimationFrame(loop);
      else cancelAnimationFrame(raf);
    };
    const mo = new MutationObserver(readColor);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", readColor);
    window.addEventListener("resize", resize);
    if (interactive) {
      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("pointerleave", onLeave);
    }
    document.addEventListener("visibilitychange", onVis);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      mo.disconnect();
      mq.removeEventListener("change", readColor);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [density, interactive]);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
