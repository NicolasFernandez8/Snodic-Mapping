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

## 2026-11-07 · Mapear por localidades o por prospectos
- Selector "Localidades enteras / Prospectos" en Panel, Agentes (Agente 1) y Calendario.
- Por prospectos: guarda N nuevos (primero los con más datos de contacto); la localidad que queda a medias pasa a "Parcial" y la próxima corrida sigue desde ahí.
- Migración `008_map_by_prospects` (estado `partial`, `schedules.unit`). Tests: 44/44.

## 2026-11-07 · Agentes 6 a 17 (gratis)
- 6 Detector de WhatsApp (móvil/fijo, suma al puntaje; filtro "Con WhatsApp (móvil)").
- 7 Priorizador diario: tarjeta "Hoy contactá" en el Panel + envío a n8n.
- 8 Vigilante de aperturas (semanal) · 12 Calendario de temporada (Nager.Date + fechas de Alicante; aviso en Panel y fechas en Calendario).
- 9 Canal alternativo (email con línea de baja / Instagram) · 10 Asistente de respuestas (prompt para la app de Claude + objeciones).
- 11 Reactivar (Seguimientos › Reactivar, a los 75 días) · Wikidata + Nominatim (Agente 2 "Datos abiertos").
- Mejor horario para escribir, Resumen para la reunión (`/prospectos/<id>/reunion`, imprimible), borrador de caso al pasar a Cliente (Casos › Borrador → publicar).
- Fix: el borrador del caso ahora se crea de forma síncrona al cambiar de etapa. Tests: 53/53.

## 2026-11-07 · Filtro visual del mapa
- Panel "Qué ver" en `/mapa` (`src/app/(app)/mapa/map-filter.tsx`): regiones → localidades con casillas (región con estado intermedio), Todas/Ninguna, búsqueda sin acentos, chips por estado, "Solo con prospectos", ⌖ para encuadrar, clic en el nombre = ver solo esa.
- Filtra en el navegador (sin pedir datos de nuevo) y recuerda la selección en el dispositivo (localStorage; se guardan las ocultas, lo nuevo aparece visible).
- `/api/geo` agrega región por localidad y `locality_id` por prospecto; `/api/export/kml?ids=1,2` exporta solo lo visible.

## 2026-11-07 · Sección Notion
- Ítem "Notion" en el menú con todo lo de Notion (enviar, traer, interruptor, estado, columnas, historial). Notion sigue desactivado.
- Job nuevo `notion_pull` (`src/lib/agents/notion-pull.ts`); `NotionClient.queryPages` y `propText`.
- KML: excluye duplicados como el mapa. Tests: 55/55.

## 2026-11-07 · Cierre
- Filtro del mapa plegable en el celular. Verificación final: 55/55 tests, typecheck y build OK.

## 2026-11-07 · Arquitectura
- Menú › Arquitectura (`/arquitectura`): árbol radial con la app al centro, 14 ramas (agentes 1–12, Captación y Notion), cada una con su color, y sus procesos.
- Partículas animadas por las ramas y flujo del pipeline diario entre agentes (respeta "reducir movimiento").
- Zoom con rueda, pellizco y botones; arrastrar para moverse; leyenda que enfoca cada agente; clic en un agente o proceso lleva a su página (anclas `/agentes#agente-N`, `/ajustes#variantes`).
- Datos en `src/lib/architecture.ts`; test que valida que cada link apunte a una página existente y tenga traducción.

## 2026-11-07 · Ficha: cajas con scroll
- Mensaje (Agente 3) e Informe (Agente 4) con caja de alto fijo (380 px; 300 px en celular) y scroll interno, igual que Reseñas. Las dos tarjetas quedan parejas.

## 2026-11-07 · Esquemas de solución
- En la ficha, debajo de Mensaje e Informe: un esquema animado por cada IDEA del Agente 4, con el mismo lenguaje visual que "Qué hacemos" de snodic-consulting (nodos de vidrio, insignia de Snodic con destellos en lo que integramos, cables que se dibujan y pulsos).
- `src/lib/schemes.ts` (puro, sin IA): detecta canal de entrada, sistema principal, pasos y resultado por palabras clave del informe. `solution-schemes.tsx`: carrusel con autoplay, pausa, flechas, teclado, tocar o deslizar; en pantallas angostas el esquema se dibuja en vertical.

## 2026-11-07 · Migraciones pendientes
- Si falta aplicar una migración, la app muestra un aviso con el comando en vez de romperse; Panel, Calendario, Casos, Seguimientos y la ficha cargan igual (`src/lib/migration-status.ts`). Pantalla de error amigable en `(app)/error.tsx`.

## 2026-11-07 · Arquitectura espacial y carpetas de Agentes
- Arquitectura: fondo oscuro tipo espacio con nodos interactivos (se conectan al pasar el mouse), agentes con contorno neón suave y halo animado, logo de Snodic en el centro.
- Agentes: carpetas cerradas por defecto (se abre sola la que viene en el link #agente-N), distintivo "N - Tarea(s)" y tareas con borde neón animado y mejor contraste.

## 2026-11-07 · Pruebas de punta a punta
- Visual: 17 páginas + mini-auditoría pública en PC (claro/oscuro) y Android (Pixel 7): sin scroll horizontal, sin elementos fuera de pantalla ni texto cortado. Menú plegable en el celular.
- Funcional: 37 recorridos (login, panel, agentes + worker, prospectos, CSV, acciones masivas, ficha completa, mini-auditoría, pipeline, seguimientos, reactivar, casos/borradores, calendario, métricas por período, mapa/KML, ajustes, región KML, Notion apagado, usuarios, idioma/tema, arquitectura).
- Arreglos: Importar CSV quedaba tapado por la tarjeta de filtros; confirmación al borrar usuario/caso/mapeo; mejor horario sin madrugada.
- Rendimiento: servidor < 60 ms por página, carga < 160 ms, JS por página ≤ 129 KB (103 KB compartidos).
