"use client";
import { useEffect } from "react";

/** Las carpetas arrancan cerradas; si se llega con #agente-N (p. ej. desde Arquitectura) se abre esa sola. */
export function OpenFromHash() {
  useEffect(() => {
    const open = () => {
      const el = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (el instanceof HTMLDetailsElement) {
        el.open = true;
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);
  return null;
}
