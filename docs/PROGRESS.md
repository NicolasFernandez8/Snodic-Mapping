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
- `npm run typecheck`, `npm run build`, `npm test` (26/26 con TEST_DATABASE_URL).
- Worker procesó un `daily_pipeline` real contra PostgreSQL local con datos demo.
- Capturas de UI revisadas (escritorio y móvil).

## No verificado (bloqueado en el entorno cloud)
- Llamadas reales a Overpass y Notion: la red del entorno las bloquea → probadas con fetch simulado.
- `docker build`: Docker Hub respondió 429 (rate limit).
- Push a GitHub: resuelto.

## 2026-11-05 · Ajustes del usuario
- Modo costo cero (OSM, reseñas pegadas a mano, IA manual).
- Campos alineados con la base de Notion de Snodic (Business Days/Hours, Ready, Location, Webpage, Phone, Address, Contact Info, Area, Category, Email, Type, URL Google Maps). Migración `002_notion_fields`.
- Usuarios con roles (admin/miembro), login con sesiones en DB, hash scrypt, bloqueo tras 5 intentos, CLI `npm run user`. Migración `003_users`.
- Interruptor "Enviar a Notion" (apagado por defecto): los datos quedan solo en la app hasta activarlo.
- Panel, Agentes y Mapa se actualizan en vivo mientras trabajan los agentes.
- Acceso del equipo: Tailscale (compartir máquina) o Cloudflare quick tunnel, ambos sin costo.

## 2026-11-05 · Captación (10 funcionalidades)
| Task (EN) | Pts | Resultado |
|---|---|---|
| Contact pipeline (CRM) | 5 | Etapas, kanban, historial (`activities`) |
| Follow-up reminders | 5 | `/seguimientos`, días y máximo configurables |
| WhatsApp click-to-chat | 2 | Botón `wa.me` que registra el envío |
| Lead scoring | 5 | 0–100 con motivos, recalculado al completar datos/reseñas |
| Conversion metrics | 5 | `/metricas` |
| Message A/B testing | 3 | `message_variants`, reparto parejo |
| Problem-based case studies | 3 | `/casos`, sugerencias por problema |
| Free mini-audit page | 8 | `/a/<código>` público, noindex, vistas |
| n8n notifications | 3 | `N8N_WEBHOOK_URL` |
| Shared team workspace | 5 | Responsable, filtros "míos", notas, aviso de doble contacto |

Migración `004_crm`. Tests: 31/31.
