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

    const LINK = 130; // distancia normal de conexión entre nodos
    const FIELD = 220; // radio de influencia del cursor
    const LINK_NEAR = 230; // cerca del cursor los nodos se conectan desde más lejos
    // Cercanía al cursor (0 = lejos, 1 = encima); se suaviza para que la red "se encienda" gradualmente.
    const near = (n: { x: number; y: number }) => {
      if (!interactive) return 0;
      const d = Math.hypot(n.x - mouse.x, n.y - mouse.y);
      return d >= FIELD ? 0 : 1 - d / FIELD;
    };
    const glow: number[] = [];

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const k = near(n);
        glow[i] = (glow[i] ?? 0) + (k - (glow[i] ?? 0)) * 0.12;
        if (!reduce) {
          // atracción suave hacia el cursor: los nodos se agrupan y se interconectan
          // (sin amontonarse: a menos de 70 px se apartan un poco y forman un anillo alrededor del cursor)
          if (k > 0) {
            const d = Math.hypot(mouse.x - n.x, mouse.y - n.y) || 1;
            const pull = d > 70 ? 0.006 * k : -0.02 * (1 - d / 70);
            n.x += (mouse.x - n.x) * pull;
            n.y += (mouse.y - n.y) * pull;
          }
          n.x += n.vx;
          n.y += n.vy;
          if (n.x < -20) n.x = w + 20;
          if (n.x > w + 20) n.x = -20;
          if (n.y < -20) n.y = h + 20;
          if (n.y > h + 20) n.y = -20;
        }
      }
      // líneas entre nodos: cerca del cursor se conectan más, más lejos y más brillantes
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const g = Math.min(glow[i], glow[j]);
          const range = LINK + (LINK_NEAR - LINK) * g;
          const dx = a.x - b.x, dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < range * range) {
            const f = 1 - Math.sqrt(d2) / range;
            ctx.lineWidth = 1 + g * 0.8;
            ctx.strokeStyle = rgba(f * (0.22 + 0.5 * g));
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
        // hilo fino hacia el cursor
        if (glow[i] > 0.05) {
          ctx.lineWidth = 1;
          ctx.strokeStyle = rgba(0.35 * glow[i]);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(mouse.x, mouse.y);
          ctx.stroke();
        }
      }
      // nodos: los "hub" laten y todos se agrandan/brillan al acercar el cursor
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const g = glow[i];
        const pulse = n.hub && !reduce ? 1 + 0.35 * Math.sin(t / 600 + n.x) : 1;
        if (n.hub || g > 0.05) {
          ctx.fillStyle = rgba(0.12 + 0.18 * g);
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r * (n.hub ? 5 : 3.5) * pulse * (1 + g * 0.6), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = rgba(Math.min(1, (n.hub ? 0.85 : 0.5) + 0.5 * g));
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r * (n.hub ? 1.8 : 1) * (1 + g * 0.8), 0, Math.PI * 2);
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
