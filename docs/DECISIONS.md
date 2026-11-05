# Decisiones (ADR resumidas)

**D1 · Sectorización con OpenStreetMap, no con Idealista (2026-11-05).**
Idealista no ofrece API pública para sus zonas y extraerlas de la web sería scraping (prohibido por las normas de Snodic). OSM tiene límites administrativos abiertos (ODbL) por municipio/distrito/barrio vía Overpass API. Para replicar sectores de Idealista a mano: dibujarlos en My Maps, exportar KML e importarlos (Ajustes → Agregar región).

**D2 · Google Places API (New) como fuente principal.** Es la API oficial para negocios y reseñas de Google Maps. Limitación: máx. 5 reseñas por lugar y 60 resultados por búsqueda (se subdivide el área). Alternativa gratuita: POIs de OSM (sin reseñas).

**D3 · My Maps por KML.** Google My Maps no tiene API de escritura; automatizarlo por navegador sería frágil y contra términos. Se exporta KML (localidades coloreadas por estado + prospectos por carpeta).

**D4 · IA con modo manual por defecto.** La generación automática usa la API de Anthropic (pago por uso, la activa el usuario). Sin clave, la app deja el prompt exacto listo para copiar y recibe la respuesta pegada. No se automatizan apps de suscripción.

**D5 · Esquema `mapping` dentro de la base `snodic`.** Aprovecha PostgreSQL y backups existentes sin mezclar tablas. Migraciones SQL versionadas con su `.down.sql`.

**D6 · Cola en PostgreSQL** (`jobs` + `SKIP LOCKED`) en lugar de Redis: menos infraestructura. El worker corre el cron diario.

**D7 · Next.js 15 + server actions**, un solo repo y una sola imagen Docker (web y worker). TypeScript fijado en 5.9.

**D8 · Notion: tipos detectados, nombres configurables.** No se conoce el esquema exacto de la base de Snodic: se lee en tiempo de ejecución y se mapea con `NOTION_PROPERTY_MAP`. Vacíos = `-` en texto, `null` en url/teléfono/email/número.

**D9 · Validación automática + revisión humana.** Los textos que no cumplen las reglas del prompt quedan `needs_review`. Nada se envía a prospectos automáticamente.
