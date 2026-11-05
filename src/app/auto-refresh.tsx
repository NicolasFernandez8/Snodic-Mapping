"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Refresca la página cada `seconds` mientras haya agentes trabajando, para ver el avance en vivo. */
export function AutoRefresh({ active, seconds = 4 }: { active: boolean; seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [active, seconds, router]);
  return active ? (
    <span className="badge warn" style={{ alignSelf: "center" }}>● Agentes trabajando · actualizando en vivo</span>
  ) : null;
}
