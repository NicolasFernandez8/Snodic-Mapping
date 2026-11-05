import type { MetadataRoute } from "next";

/** App instalable (PWA): en el celular, "Agregar a pantalla de inicio". */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Snodic Mapping",
    short_name: "Snodic",
    description: "Captación de prospectos por zonas",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#021e45",
    theme_color: "#021e45",
    lang: "es",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Revisión rápida", url: "/revision" },
      { name: "Seguimientos", url: "/seguimientos" },
    ],
  };
}
