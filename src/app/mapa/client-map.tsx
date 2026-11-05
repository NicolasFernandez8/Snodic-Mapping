"use client";
import dynamic from "next/dynamic";

// Leaflet usa window: se carga solo en el navegador.
export const ClientMap = dynamic(() => import("./map-view"), {
  ssr: false,
  loading: () => <div className="empty">Cargando mapa…</div>,
});
