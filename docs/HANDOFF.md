# Handoff

**Objetivo:** automatizar la captación de prospectos de Snodic (Alicante → otras zonas) con 4 agentes.
**Fase:** MVP funcional completo; falta puesta en marcha con claves reales en la PC de Snodic.

## Estado
- Código, tests y docs listos en `main` (ver `docs/PROGRESS.md`).
- Nada desplegado todavía en la PC; nada tocado en la infraestructura existente.

## Próximos pasos (en orden)
1. **Usuario:** seguir `docs/SETUP.md` §1–3 en la PC (clonar, `.env`, GRANT CREATE, migrar, levantar).
2. **Usuario:** crear la integración de Notion (gratis) y compartir la base de prospectos con ella. **Sin** claves de Google ni Anthropic: modo costo cero.
3. Por cada prospecto: abrir en Google Maps → pegar reseñas → copiar prompts en la app de Claude → pegar respuestas.
4. Primera corrida con 1 localidad (Ajustes → cuota 1) y revisar en Notion que las columnas coinciden; ajustar `NOTION_PROPERTY_MAP` si hace falta.
5. Importar la región Alicante (nivel 6 → 8 o 8 → 10) y dejar correr el cron diario.

## Ideas siguientes (no empezadas)
- Webhook para que n8n dispare el pipeline o reciba avisos.
- Detección de duplicados entre fuentes (OSM ↔ Google) por cercanía + nombre.
- Panel de métricas de respuesta (cuando se registre el resultado del contacto).
- Refrescar reseñas periódicamente y purgar datos según términos de Google.

## Comandos clave
`npm run dev` · `npm run worker` · `npm run migrate` · `npm test` · `docker compose up -d web worker`

## Crédito cloud
USD 100 de crédito de sesiones en la nube (claude.ai), vence 2026-11-05 04:59 GMT-3. Se usó para construir este MVP en una sola sesión.
