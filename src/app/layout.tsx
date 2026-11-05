import type { Metadata } from "next";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import { Nav } from "./nav";

export const metadata: Metadata = {
  title: "Snodic Mapping",
  description: "Agentes de captación de prospectos por zonas",
  icons: { icon: "/logo.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>
        <div className="shell">
          <aside className="sidebar">
            <div className="brand">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="Snodic" />
              <div>
                <strong>snodic</strong>
                <span>Mapping</span>
              </div>
            </div>
            <Nav />
            <div className="foot">Snodic Consulting · Captación</div>
          </aside>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
