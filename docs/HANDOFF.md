# Handoff

**Objetivo:** automatizar la captación de prospectos de Snodic (Alicante → otras zonas) con 4 agentes y un módulo de captación (CRM liviano), todo a costo cero.
**Fase:** agentes 6–17 listos (2026-11-07, migración `009_agents_plus`, pendiente de aplicar en la PC). Instalada y funcionando en la PC de Snodic (2026-11-07): imagen Docker OK, migraciones 001–007 aplicadas con el usuario `snodic_mapping`, web y worker arriba.

## Estado (2026-11-07)
- `main` al día. 53 tests (unit + integración con PostgreSQL), typecheck y build OK.
- Migraciones: `001_init` … `009_agents_plus`.
- Agentes 6–12 + mejoras 13–17 (WhatsApp móvil/fijo, Hoy contactá, aperturas, email/IG, asistente de respuestas, reactivar, temporada, Wikidata/Nominatim, mejor horario, resumen de reunión, borrador de caso).
- Pantallas: Panel, Mapa, Prospectos (filtros, CSV, acciones masivas), Revisión rápida, Prompts en lote, Pipeline, Seguimientos, Métricas, Casos de éxito, Agentes, Ajustes, Usuarios, mini-auditoría pública `/a/<código>`.
- Idioma ES/EN y tema auto/claro/oscuro. App instalable en el celular.
- Notion apagado por defecto. Sin servicios pagos (OSM + modo manual de IA).
- No se tocó la infraestructura existente.

## Pendiente (siguiente tarea pedida por Nico)
- **Sección exclusiva "Notion" en el menú** (Notion sigue DESACTIVADO): mover ahí todo lo de Notion (botones de enviar/sincronizar, traer de Notion, estado, ajustes `notion_enabled`), y sacarlo de Agentes/Ajustes/ficha/Panel. Ver prompt de traspaso en el chat del 2026-11-07.

## No verificado en la nube
- Llamadas reales a Overpass/Notion (red del entorno bloqueada) → probadas con respuestas simuladas.
- `docker build` (Docker Hub limitó las descargas) → probar en la PC.

## Próximos pasos (usuario, en la PC)
1. `git pull` en `C:\Users\Nico_\Snodic\mapping`, `.env` desde `.env.example`.
2. pgAdmin: `GRANT CREATE ON DATABASE snodic TO snodic_app;` (una vez).
3. `docker compose build` → `docker compose --profile tools run --rm migrate` → `docker compose up -d web worker`.
4. Crear admins: `docker compose run --rm -it web npm run user -- create <usuario> admin`.
5. `tailscale serve --bg --https=8445 http://127.0.0.1:3000` y compartir la máquina con el socio.
6. Ajustes → Agregar región "Alicante" (6 → 8) → Panel → Ejecutar pipeline.

## Comandos clave
`npm run dev` · `npm run worker` · `npm run migrate` · `npm run user -- list` · `npm test` · `docker compose up -d web worker`
