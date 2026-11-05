"use client";
import { useEffect, useState } from "react";

/** Anima un número de 0 al valor final (solo si es un número; si no, lo muestra tal cual). */
export function CountUp({ value, ms = 900 }: { value: string | number; ms?: number }) {
  const target = typeof value === "number" ? value : /^\d+$/.test(String(value)) ? Number(value) : null;
  const [n, setN] = useState(target === null ? null : 0);
  useEffect(() => {
    if (target === null) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setN(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      setN(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return <>{target === null ? value : n}</>;
}
