"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Panel", icon: "▦" },
  { href: "/mapa", label: "Mapa", icon: "◉" },
  { href: "/prospectos", label: "Prospectos", icon: "☰" },
  { href: "/pipeline", label: "Pipeline", icon: "▥" },
  { href: "/seguimientos", label: "Seguimientos", icon: "↻" },
  { href: "/metricas", label: "Métricas", icon: "↗" },
  { href: "/casos", label: "Casos de éxito", icon: "★" },
  { href: "/agentes", label: "Agentes", icon: "⚙" },
  { href: "/ajustes", label: "Ajustes", icon: "✎" },
  { href: "/usuarios", label: "Usuarios", icon: "👤" },
];

export function Nav({ isAdmin }: { isAdmin: boolean }) {
  void isAdmin; // todos ven "Usuarios": los miembros solo pueden cambiar su contraseña
  const path = usePathname();
  return (
    <nav className="nav">
      {LINKS.map((l) => {
        const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} className={active ? "active" : ""}>
            <span aria-hidden>{l.icon}</span>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
