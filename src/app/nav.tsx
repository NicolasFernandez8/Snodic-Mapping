"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Panel", icon: "▦" },
  { href: "/mapa", label: "Mapa", icon: "◉" },
  { href: "/prospectos", label: "Prospectos", icon: "☰" },
  { href: "/agentes", label: "Agentes", icon: "⚙" },
  { href: "/ajustes", label: "Ajustes", icon: "✎" },
];

export function Nav() {
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
