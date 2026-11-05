"use client";
import dynamic from "next/dynamic";
import { useT } from "@/lib/i18n/client";

function Loading() {
  const t = useT();
  return <div className="empty">{t("Cargando mapa…")}</div>;
}

// Leaflet usa window: se carga solo en el navegador.
export const ClientMap = dynamic(() => import("./map-view"), { ssr: false, loading: () => <Loading /> });
