# Snodic-Mapping

Automatiza el trabajo diario de captación de Snodic: recorrer una zona **localidad por localidad**, encontrar prospectos del rubro (por defecto **hotelería y alojamientos**), guardar sus datos en **Notion** y dejar en cada ficha un **mensaje de WhatsApp** personalizado y un **informe con 2 ideas** de soluciones, todo a partir de las reseñas reales.

| Agente | Qué hace | Fuente |
|---|---|---|
| 1 · Mapeo | Divide la región en localidades (OSM o sectores propios en KML) y cada día mapea las próximas N, del centro hacia afuera. Al terminar una región pasa a la siguiente. Rubro configurable. | OpenStreetMap + Google Places API |
| 2 · Datos | Completa teléfono, web, Instagram, enlace de reseñas y reseñas. Lo que no encuentra queda como `-`. Crea/actualiza la ficha en Notion. | Google Places API · Notion API |
| 3 · Mensaje | Mensaje de WhatsApp (prompt de Snodic) y validación automática de reglas. Se escribe en el cuerpo de la página de Notion. | Claude (API) o modo manual |
| 4 · Informe | Exactamente 2 ideas con el framework de 7 pasos, 2 espacios debajo del mensaje. | Claude (API) o modo manual |

Interfaz: panel con avance, mapa de sectores, listado y ficha de prospectos (copiar mensaje, regenerar, editar a mano), ejecución de agentes con historial y ajustes (rubro, ritmo diario, regiones).
Exporta **KML para Google My Maps** y **CSV**.

## Inicio rápido (desarrollo)
```bash
npm install
cp .env.example .env        # completar DATABASE_URL como mínimo
npm run migrate
npm run seed:demo           # opcional: datos ficticios para ver la UI
npm run dev                 # http://localhost:3000
npm run worker              # en otra terminal
```

Instalación en la PC de Snodic (Docker + PostgreSQL existente + Tailscale): **[docs/SETUP.md](docs/SETUP.md)**.

## Documentación
- [docs/SETUP.md](docs/SETUP.md) — instalación, claves y Notion paso a paso
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — diseño técnico
- [docs/DECISIONS.md](docs/DECISIONS.md) — decisiones y motivos
- [docs/SECURITY.md](docs/SECURITY.md) — secretos, permisos y cumplimiento
- [docs/PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md) — infraestructura de Snodic
- [docs/PROGRESS.md](docs/PROGRESS.md) · [docs/HANDOFF.md](docs/HANDOFF.md) — estado y continuidad
