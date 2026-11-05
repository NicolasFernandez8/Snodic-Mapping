# Snodic-Mapping — instrucciones para agentes

App de Snodic que automatiza la captación de prospectos por zonas geográficas (empezando por Alicante, España).
Cuatro agentes: (1) mapeo por localidades, (2) recopilación de datos + Notion, (3) mensaje de WhatsApp, (4) informe de 2 ideas.

## Leer primero
- `docs/HANDOFF.md` — estado actual y próximo paso.
- `docs/ARCHITECTURE.md` — cómo está armado.
- `docs/DECISIONS.md` — por qué (no repetir discusiones cerradas).

## Stack
Next.js 15 (App Router, server actions) + TypeScript 5.9 · PostgreSQL 17 (esquema `mapping`) · worker Node (`tsx src/worker.ts`, cola en tabla `jobs`) · Leaflet · Vitest.
TypeScript 7 rompe los alias `@/` en Next 15: mantener `typescript@5.9`.

## Comandos
```bash
npm run dev          # UI en :3000
npm run worker       # agentes + pipeline diario (cron)
npm run migrate      # aplica db/migrations/*.sql pendientes
npm run seed:demo    # datos ficticios (NO en producción)
npm test             # unit; con TEST_DATABASE_URL corre también integración
npm run typecheck && npm run build
```

## Reglas
- Español rioplatense con el usuario; textos de la app en español; títulos de tareas de Notion en inglés.
- Prompts de agentes 3 y 4 en `src/lib/ai/prompts.ts` son de Snodic: no cambiarlos sin pedirlo; si cambian, subir `PROMPT_VERSION`.
- Datos no encontrados = `"-"` (convención del usuario).
- Solo APIs oficiales: Google Places API (New), Notion API, Overpass/OSM, Anthropic API. **Nada de scraping** (ni Idealista, ni Google Maps web).
- Google My Maps no tiene API de escritura → se exporta KML.
- Nunca versionar secretos (`.env`, `*_password.txt`, `secrets/`, backups). Usar `.env.example`.
- No tocar la infraestructura existente (contenedores `snodic-postgres`, `n8n`, etc.) ni hacer migraciones destructivas sin aprobación.
- Revisión humana antes de enviar mensajes a prospectos.
- Commits chicos; actualizar `docs/PROGRESS.md` y `docs/HANDOFF.md` en cada hito.
