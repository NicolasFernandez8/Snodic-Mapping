"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/lib/i18n/client";

/** Íconos de línea propios: todos del mismo grosor y del color del texto (currentColor). */
const ICONS: Record<string, React.ReactNode> = {
  panel: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>
  ),
  mapa: (
    <>
      <path d="M9 4 3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5z" />
      <path d="M9 4v13.5M15 6.5V20" />
    </>
  ),
  prospectos: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c2 .7 3.2 2.4 3.5 5.2" />
    </>
  ),
  revision: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  lote: (
    <>
      <path d="m12 3 9 5-9 5-9-5z" />
      <path d="m3 13 9 5 9-5" />
    </>
  ),
  pipeline: (
    <>
      <rect x="3" y="3" width="5" height="18" rx="1.5" />
      <rect x="10" y="3" width="5" height="12" rx="1.5" />
      <rect x="17" y="3" width="4" height="7" rx="1.5" />
    </>
  ),
  seguimientos: (
    <>
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 4v7h-7" />
    </>
  ),
  metricas: (
    <>
      <path d="M3 20h18" />
      <path d="m4 15 5-5 4 4 7-8" />
      <path d="M15 6h5v5" />
    </>
  ),
  casos: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />,
  calendario: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
      <path d="M8 14h2M14 14h2M8 17.5h2" />
    </>
  ),
  agentes: (
    <>
      <rect x="5" y="7" width="14" height="12" rx="3" />
      <path d="M12 3v4M9 12h.01M15 12h.01M9.5 16h5M2 12v3M22 12v3" />
    </>
  ),
  usuarios: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c.8-4.2 4-6.5 8-6.5s7.2 2.3 8 6.5" />
    </>
  ),
  ajustes: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
};

const LINKS = [
  { href: "/", label: "Panel", icon: "panel" },
  { href: "/mapa", label: "Mapa", icon: "mapa" },
  { href: "/prospectos", label: "Prospectos", icon: "prospectos" },
  { href: "/revision", label: "Revisión rápida", icon: "revision" },
  { href: "/lote", label: "Prompts en lote", icon: "lote" },
  { href: "/pipeline", label: "Pipeline", icon: "pipeline" },
  { href: "/seguimientos", label: "Seguimientos", icon: "seguimientos" },
  { href: "/metricas", label: "Métricas", icon: "metricas" },
  { href: "/casos", label: "Casos de éxito", icon: "casos" },
  { href: "/calendario", label: "Calendario", icon: "calendario" },
  { href: "/agentes", label: "Agentes", icon: "agentes" },
  { href: "/usuarios", label: "Usuarios", icon: "usuarios" },
  { href: "/ajustes", label: "Ajustes", icon: "ajustes" },
];

export function Nav({ isAdmin }: { isAdmin: boolean }) {
  void isAdmin; // todos ven "Usuarios": los miembros solo pueden cambiar su contraseña
  const path = usePathname();
  const t = useT();
  return (
    <nav className="nav">
      {LINKS.map((l) => {
        const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} className={active ? "active" : ""}>
            <svg
              className="nav-ico"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              {ICONS[l.icon]}
            </svg>
            {t(l.label)}
          </Link>
        );
      })}
    </nav>
  );
}
