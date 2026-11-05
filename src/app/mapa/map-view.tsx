"use client";
import { useEffect, useState } from "react";
import { CircleMarker, GeoJSON, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import type { FeatureCollection } from "geojson";

const STATUS_COLOR: Record<string, string> = {
  mapped: "#1c6fef",
  mapping: "#d98a00",
  pending: "#8a9ab3",
  failed: "#d93a3a",
  skipped: "#c0c7d2",
};

type Data = {
  localities: FeatureCollection;
  prospects: { id: number; name: string; status: string; lat: number; lng: number; locality: string | null; rating: string | null }[];
};

function FitBounds({ data }: { data: Data | null }) {
  const map = useMap();
  useEffect(() => {
    if (!data?.localities.features.length) return;
    const b = L.geoJSON(data.localities).getBounds();
    if (b.isValid()) map.fitBounds(b, { padding: [20, 20] });
  }, [data, map]);
  return null;
}

export default function MapView() {
  const [data, setData] = useState<Data | null>(null);
  useEffect(() => {
    fetch("/api/geo")
      .then((r) => r.json())
      .then(setData);
  }, []);

  return (
    <MapContainer center={[38.35604, -0.50391]} zoom={12} style={{ height: "100%", width: "100%" }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {data && (
        <GeoJSON
          key={data.localities.features.length}
          data={data.localities}
          style={(f) => {
            const c = STATUS_COLOR[f?.properties?.status] ?? "#8a9ab3";
            return { color: "#021e45", weight: 1.2, fillColor: c, fillOpacity: f?.properties?.status === "pending" ? 0.08 : 0.25 };
          }}
          onEachFeature={(f, layer) =>
            layer.bindPopup(
              `<strong>${escapeHtml(f.properties.name)}</strong><br/>Estado: ${f.properties.status}<br/>Prospectos: ${f.properties.prospects}` +
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
          pathOptions={{ color: "#fff", weight: 1.5, fillColor: p.status === "synced" ? "#12a150" : "#1c6fef", fillOpacity: 1 }}
        >
          <Popup>
            <strong>{p.name}</strong>
            <br />
            {p.locality ?? "-"} · {p.rating ? `${p.rating}★` : "-"}
            <br />
            <a href={`/prospectos/${p.id}`}>Ver ficha →</a>
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
