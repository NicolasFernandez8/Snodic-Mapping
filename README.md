# Snodic-Mapping

Automatiza el trabajo diario de captación de Snodic: recorrer una zona **localidad por localidad**, encontrar prospectos del rubro (por defecto **hotelería y alojamientos**), guardar sus datos en **Notion** y dejar en cada ficha un **mensaje de WhatsApp** personalizado y un **informe con 2 ideas** de soluciones, todo a partir de las reseñas reales.

| Agente | Qué hace | Fuente |
|---|---|---|
| 1 · Mapeo | Divide la región en localidades (OSM o sectores propios en KML) y cada día mapea las próximas N, del centro hacia afuera. Al terminar una región pasa a la siguiente. Rubro configurable. | OpenStreetMap |
| 2 · Datos | Completa teléfono, web, email, Instagram y link de Google Maps. Lo que no encuentra queda como `-`. Crea/actualiza la ficha en Notion. Reseñas: se pegan a mano en la ficha. | OpenStreetMap · Notion API |
| 3 · Mensaje | Mensaje de WhatsApp (prompt de Snodic) y validación automática de reglas. Se escribe en el cuerpo de la página de Notion. | Modo manual con tu app de Claude |
| 4 · Informe | Exactamente 2 ideas con el framework de 7 pasos, 2 espacios debajo del mensaje. | Modo manual con tu app de Claude |

**Costo cero:** todo funciona sin claves de pago ni datos de facturación (ver `docs/SETUP.md` §5).

Interfaz: panel con avance en vivo, mapa de sectores, listado y ficha de prospectos, ejecución de agentes con historial, ajustes y usuarios con roles.

**Captación (después del mapeo):**
- **Pipeline** kanban: Por contactar → Contactado → Respondió → Reunión → Cliente / Descartado, con historial y notas.
- **WhatsApp click-to-chat** (`wa.me`, gratis): abre el chat con el mensaje cargado; la persona envía y la app lo registra.
- **Seguimientos** automáticos: lista diaria de quién no respondió, con el mensaje de seguimiento armado.
- **Puntaje 0–100** con motivos visibles, para contactar primero a los que más conviene.
- **Métricas**: embudo y tasa de respuesta por región, localidad, categoría, puntaje y variante.
- **A/B de mensajes**: variantes del Agente 3 repartidas en partes iguales.
- **Casos de éxito** sugeridos según los problemas de las reseñas.
- **Mini-auditoría pública** `/a/<código>` con las 2 oportunidades del Agente 4 y tu marca, con contador de vistas.
- **Avisos a n8n**: resumen diario, respuestas y vistas de auditoría.
- **Equipo**: responsables, "mis prospectos", notas internas y aviso si otro ya contactó.
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
