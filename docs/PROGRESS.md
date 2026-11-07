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

## 2026-11-05 · Idioma y tema
- Selector ES/EN y tema Auto/Claro/Oscuro (cookies por navegador) en la barra lateral y en el login.
- Textos de la interfaz traducidos (`src/lib/i18n/en.ts`; la clave es el texto en español). Un test falla si aparece un texto nuevo sin traducción.
- Lo que va a prospectos (mensajes, informes, seguimientos, mini-auditoría) queda siempre en español de España.

## 2026-11-05 · Funcionalidad y rendimiento (15 mejoras)
| Task (EN) | Pts | Resultado |
|---|---|---|
| Batch prompts (manual mode) | 5 | `/lote`: un prompt para 3–10 prospectos y parser de la respuesta |
| Quick review mode | 5 | `/revision` con atajos W/S/D/E |
| Do-not-contact list (GDPR) | 3 | Bloquea por teléfono o nombre, también al mapear e importar |
| Duplicate detection | 5 | Al mapear/importar y trabajo "Buscar duplicados" |
| CSV import | 3 | Encabezados de Notion o en español |
| Bulk actions | 3 | Asignar, mover de etapa, descartar |
| Installable app (PWA) | 2 | Manifest, íconos, service worker solo para estáticos |
| Meeting .ics | 2 | En la ficha cuando la etapa es Reunión |
| Light map + ETag | 5 | Polígonos simplificados, 304 si no hay cambios |
| Pipeline query | 3 | 60 por etapa en una consulta |
| Smart live refresh | 3 | `/api/status`, solo recarga si cambió |
| Metrics cache + indexes | 3 | 60 s en memoria |
| Robust Overpass | 3 | Caché 7 días, reintentos, servidores alternativos |
| Batch rescoring | 2 | Bloques de 500 |
| Worker heartbeat | 2 | Aviso en Panel y `/api/health` para n8n |

Migración `005_perf_quality`. Tests: 39/39.

## 2026-11-05 · Filtros y "qué funciona"
| Task (EN) | Pts | Resultado |
|---|---|---|
| Combinable filters + saved searches | 8 | Zona, distancia, categoría, estrellas, cadena/independiente, contacto, problemas, rating, reseñas, puntaje, etapa, responsable. En Prospectos, Revisión rápida, Lote y Pipeline. |
| Response insights + learned score | 5 | Métricas → "Qué funciona": tasa de respuesta por característica, búsqueda sugerida (≥50 contactados) y ±15 puntos según prospectos parecidos. |

Migración `006_filters` (estrellas, cadena, problemas detectados, búsquedas guardadas). Tests: 42/42.

## 2026-11-05 · Cantidad a mapear y calendario
- Barra deslizante + número editable (1–50) en Panel ("Solo mapear" / "Pipeline completo"), Agentes y Ajustes.
- `/calendario`: mes con mapeos programados (azul), ejecutados (verde) y con error (rojo); programar una vez o semanal (días + hora), con cantidad y tipo; pausar, reanudar, borrar. Zona horaria Argentina o Madrid.
- El worker revisa cada minuto los programados vencidos (migración `007_schedules`). Tests: 44/44.

## 2026-11-07 · Puesta en marcha en la PC
- `docker compose build` OK en Windows.
- Usuario de base propio `snodic_mapping` (no se tocó `snodic_app` ni n8n).
- Fix: registro de migraciones en `mapping.schema_migrations` (PostgreSQL 15+ no deja crear en `public`).
- Migraciones 001–007 aplicadas; web y worker corriendo.
