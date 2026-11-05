# Arquitectura

```
Navegador ──► Next.js (web) ──► PostgreSQL "snodic" · esquema mapping
                 │  server actions encolan trabajos           ▲
                 ▼                                            │
              jobs (tabla) ◄── worker (node-cron + bucle) ────┘
                                   │
          ┌────────────────────────┼─────────────────────────────┐
          ▼                        ▼                             ▼
   Overpass / OSM          Google Places API (New)        Notion API · Anthropic API
   (límites, POIs)         (búsqueda, detalles, reseñas)
```

## Módulos (`src/lib`)
| Ruta | Rol |
|---|---|
| `config.ts` | Variables de entorno validadas con zod |
| `db.ts`, `migrate.ts` | Pool `pg` (search_path=mapping), settings, migraciones SQL |
| `jobs.ts` | Cola con `FOR UPDATE SKIP LOCKED`, reintentos con backoff, recuperación de trabajos colgados |
| `geo/geometry.ts` | Unión de anillos OSM, punto-en-polígono con huecos, bbox, centroide, haversine, grilla |
| `geo/osm.ts` | Consultas Overpass (región, subdivisiones, POIs) y conversión de relaciones a GeoJSON |
| `geo/kml.ts`, `geo/kml-import.ts` | Exportar a My Maps / importar sectores propios |
| `sources/places.ts` | Text Search paginado (60) con subdivisión del área si satura; Place Details con reseñas |
| `notion.ts` | Detección de tipos de propiedades, `-` en vacíos, bloques del cuerpo, reintentos 429 |
| `ai/prompts.ts`, `ai/validate.ts`, `ai/llm.ts` | Prompts de Snodic, validación de reglas, proveedor (anthropic/manual) |
| `agents/agent1-mapper.ts` | Importar región, cola de localidades por distancia al origen, descubrir y filtrar por polígono |
| `agents/agent2-collector.ts` | Completar datos y sincronizar propiedades en Notion |
| `agents/agent34-writer.ts` | Generar mensaje/informe, versionar salidas, escribir el cuerpo de Notion |
| `agents/orchestrator.ts` | Despacho de trabajos y pipeline diario |

## Estados del prospecto
`new` → (Agente 2) `enriched` → (Agente 3) `message_ready` → (Agente 4) `report_ready` → (Notion cuerpo) `synced`. `discarded` es manual.
Las salidas (`outputs`) se versionan; la última por tipo es la vigente. Estados: `ready`, `needs_review` (validación falló o sin reseñas), `pending_manual`, `failed`.

## Modelo de datos (esquema `mapping`)
`niches` (rubros) · `regions` (orden de recorrido, una `active`) · `localities` (GeoJSON, bbox, centroide, distancia al origen, estado) · `prospects` (único por `source`+`source_id`) · `reviews` · `outputs` · `jobs` · `settings`.

## Pipeline diario
1. Agente 1 mapea `daily_locality_quota` localidades (la más cercana al origen primero; origen = centro del My Maps de Alicante).
2. Agente 2 completa los `new` y crea/actualiza páginas en Notion.
3. Agentes 3 y 4 (si `auto_generate_outputs`) generan textos y se escriben en el cuerpo de Notion.
Cada paso aísla errores: uno que falla no corta a los demás. El log queda en `jobs.result.log`.
