"use client";
import { useEffect } from "react";

/** Ctrl/Cmd + Enter envía el formulario con "Guardar y siguiente". */
export function SubmitOnCtrlEnter({ formId }: { formId: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        const form = document.getElementById(formId) as HTMLFormElement | null;
        const save = form?.querySelector<HTMLButtonElement>("button[data-save]");
        if (save) {
          e.preventDefault();
          form!.requestSubmit(save);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [formId]);
  return null;
}
