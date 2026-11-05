# Progreso

## Completado (2026-11-05, sesión cloud)
| Task (EN) | Pts | Resultado |
|---|---|---|
| Set up repository and tooling | 2 | Next 15 + TS 5.9 + Vitest, `.gitignore` de secretos, `.env.example` |
| Design mapping schema | 5 | `db/migrations/001_init.sql` (+ down), esquema `mapping` |
| Build OSM sectorization | 8 | Overpass, unión de anillos, punto-en-polígono, importación por niveles admin |
| Import custom sectors from KML | 3 | Sectores dibujados en My Maps → localidades |
| Build Google Places discovery | 5 | Text Search paginado + subdivisión, filtro por rubro y polígono |
| Configurable niche filter | 3 | Rubros en DB + formulario en Ajustes |
| Build data collector (Agent 2) | 5 | Place Details, reseñas, Instagram, `-` en vacíos |
| Notion sync | 8 | Detección de tipos, mapeo configurable, cuerpo mensaje + 2 vacíos + informe, reemplazo sin duplicar |
| WhatsApp message agent (Agent 3) | 5 | Prompt de Snodic + validación de reglas |
| Opportunity report agent (Agent 4) | 5 | Prompt de Snodic + validación de 2 ideas × 7 secciones |
| Job queue and daily worker | 5 | `jobs` con SKIP LOCKED, cron, reintentos |
| Web UI | 8 | Panel, Mapa (Leaflet), Prospectos, Ficha, Agentes, Ajustes, marca Snodic, responsive |
| KML/CSV export | 3 | My Maps y planillas |
| Docker deployment files | 3 | Dockerfile + compose en red `snodic-postgres_default` |
| Tests | 5 | 19 tests (unit + integración con PostgreSQL) |
| Documentation | 3 | README, CLAUDE.md, docs/* |

## Verificado
- `npm run typecheck`, `npm run build`, `npm test` (21/21 con TEST_DATABASE_URL).
- Worker procesó un `daily_pipeline` real contra PostgreSQL local con datos demo.
- Capturas de UI revisadas (escritorio y móvil).

## No verificado (bloqueado en el entorno cloud)
- Llamadas reales a Overpass y Notion: la red del entorno las bloquea → probadas con fetch simulado.
- `docker build`: Docker Hub respondió 429 (rate limit).
- Push a GitHub: resuelto.
