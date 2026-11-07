# Handoff

**Objetivo:** automatizar la captación de prospectos de Snodic (Alicante → otras zonas) con 4 agentes y un módulo de captación (CRM liviano), todo a costo cero.
**Fase:** funcional y completa (2026-11-07). En la PC corre con Docker (usuario de base `snodic_mapping`). Falta aplicar en la PC las migraciones 008 y 009 si no se corrieron.

## Estado (2026-11-07)
- `main` al día. 55 tests (unit + integración con PostgreSQL), typecheck y build OK.
- Migraciones: `001_init` … `009_agents_plus`.
- Agentes 6–12 + mejoras 13–17 (WhatsApp móvil/fijo, Hoy contactá, aperturas, email/IG, asistente de respuestas, reactivar, temporada, Wikidata/Nominatim, mejor horario, resumen de reunión, borrador de caso).
- Pantallas: Panel, Mapa, Prospectos (filtros, CSV, acciones masivas), Revisión rápida, Prompts en lote, Pipeline, Seguimientos, Métricas, Casos de éxito, Agentes, Ajustes, Usuarios, mini-auditoría pública `/a/<código>`.
- Idioma ES/EN y tema auto/claro/oscuro. App instalable en el celular.
- Notion apagado por defecto. Sin servicios pagos (OSM + modo manual de IA).
- No se tocó la infraestructura existente.

## Sección Notion (hecha 2026-11-07)
- Menú › Notion (`/notion`): interruptor `notion_enabled` (solo admin; sigue APAGADO), estado de credenciales, contadores, Enviar todo / Solo datos / Solo mensaje e informe (`sync_notion` con `part`), Traer datos (`notion_pull`, solo lectura en Notion: vincula por nombre y completa vacíos), columnas e historial.
- Se sacó Notion de Ajustes y de Agentes. Con Notion apagado nada se encola ni se llama a la API.

## No verificado en la nube
- Llamadas reales a Notion, Wikidata, Nominatim y Nager.Date (red del entorno bloqueada) → probadas con respuestas simuladas. Overpass y `docker build` ya se verificaron en la PC.

## Próximos pasos (usuario, en la PC)
1. `git pull` → `docker compose build` → `docker compose --profile tools run --rm migrate` (aplica 008/009 si faltan) → `docker compose up -d --force-recreate web worker` → Ctrl+F5.
2. Probar con red real: Agentes › "Datos abiertos" (Wikidata/Nominatim) y "Feriados y temporada" (Nager.Date).
3. Notion: cuando se quiera, cargar `NOTION_TOKEN` y `NOTION_DATABASE_ID` en `.env` y activarlo en Menú › Notion.

## Comandos clave
`npm run dev` · `npm run worker` · `npm run migrate` · `npm run user -- list` · `npm test` · `docker compose up -d web worker`
