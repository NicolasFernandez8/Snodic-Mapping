"use client";
import { useEffect } from "react";

/** Atajos de teclado del modo revisión (se ignoran mientras se escribe en un campo). */
export function Shortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.ctrlKey || e.metaKey || e.altKey || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) {
        if (e.key === "Escape") (el as HTMLElement).blur();
        return;
      }
      const k = e.key.toLowerCase();
      const click = (sel: string) => (document.querySelector(sel) as HTMLElement | null)?.click();
      if (k === "w") click("#rv-wa button");
      else if (k === "s") click("#rv-skip");
      else if (k === "d") click("#rv-discard");
      else if (k === "e") {
        e.preventDefault();
        (document.getElementById("rv-text") as HTMLTextAreaElement | null)?.focus();
      } else return;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return null;
}
