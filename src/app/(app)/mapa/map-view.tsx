"use client";
import { useEffect, useRef, useState } from "react";
import { CircleMarker, GeoJSON, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import type { FeatureCollection } from "geojson";
import { useT } from "@/lib/i18n/client";

const STATUS_COLOR: Record<string, string> = {
  mapped: "#c2337f",
  mapping: "#d98a00",
  pending: "#8a9ab3",
  failed: "#d93a3a",
  skipped: "#c0c7d2",
};

const STATUS_TEXT: Record<string, string> = {
  mapped: "Mapeada",
  mapping: "Mapeando",
  pending: "Pendiente",
  failed: "Error",
  skipped: "Omitida",
};

type Data = {
  localities: FeatureCollection;
  prospects: { id: number; name: string; status: string; lat: number; lng: number; locality: string | null; rating: string | null }[];
};

function FitBounds({ data }: { data: Data | null }) {
  const map = useMap();
  const done = useRef(false);
  useEffect(() => {
    // Encuadra solo la primera vez, para no mover el mapa en cada recarga.
    if (done.current || !data?.localities.features.length) return;
    done.current = true;
    const b = L.geoJSON(data.localities).getBounds();
    if (b.isValid()) map.fitBounds(b, { padding: [20, 20] });
  }, [data, map]);
  return null;
}

export default function MapView() {
  const t = useT();
  const [data, setData] = useState<Data | null>(null);
  useEffect(() => {
    // Recarga cada 10 s: las localidades cambian de color y aparecen los puntos a medida que el Agente 1 avanza.
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    let etag: string | null = null;
    const load = async () => {
      try {
        const res = await fetch("/api/geo", { headers: etag ? { "If-None-Match": etag } : {}, cache: "no-store" });
        if (res.status === 200) {
          etag = res.headers.get("ETag");
          setData(await res.json());
        }
        const s = (await (await fetch("/api/status", { cache: "no-store" })).json()) as { busy: boolean };
        if (!stop) timer = setTimeout(load, s.busy ? 10000 : 60000);
      } catch {
        if (!stop) timer = setTimeout(load, 30000);
      }
    };
    load();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, []);

  return (
    <MapContainer center={[38.35604, -0.50391]} zoom={12} style={{ height: "100%", width: "100%" }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {data && (
        <GeoJSON
          key={JSON.stringify(data.localities.features.map((f) => f.properties?.status))}
          data={data.localities}
          style={(f) => {
            const c = STATUS_COLOR[f?.properties?.status] ?? "#8a9ab3";
            return { color: "#4a1f4a", weight: 1.2, fillColor: c, fillOpacity: f?.properties?.status === "pending" ? 0.08 : 0.25 };
          }}
          onEachFeature={(f, layer) =>
            layer.bindPopup(
              `<strong>${escapeHtml(f.properties.name)}</strong><br/>${t("Estado: {s}", { s: t(STATUS_TEXT[f.properties.status] ?? f.properties.status) })}<br/>${t("Prospectos")}: ${f.properties.prospects}` +
                (f.properties.error ? `<br/><span style="color:#d93a3a">${escapeHtml(f.properties.error)}</span>` : ""),
            )
          }
        />
      )}
      {data?.prospects.map((p) => (
        <CircleMarker
          key={p.id}
          center={[p.lat, p.lng]}
          radius={6}
          pathOptions={{ color: "#fff", weight: 1.5, fillColor: p.status === "synced" ? "#16a36a" : "#c2337f", fillOpacity: 1 }}
        >
          <Popup>
            <strong>{p.name}</strong>
            <br />
            {p.locality ?? "-"} · {p.rating ? `${p.rating}★` : "-"}
            <br />
            <a href={`/prospectos/${p.id}`}>{t("Ver ficha →")}</a>
          </Popup>
        </CircleMarker>
      ))}
      <FitBounds data={data} />
    </MapContainer>
  );
}

function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
