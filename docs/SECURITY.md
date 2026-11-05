# Seguridad y cumplimiento

- **Secretos** solo en `.env` (ignorado por Git). Plantilla: `.env.example`. No loguear claves ni ponerlas en URLs.
- **Base de datos:** la app usa `snodic_app` (sin superusuario). `CREATE ON DATABASE` solo para la primera migración; se puede revocar después.
- **Red:** web publicada en `127.0.0.1:3000`; acceso remoto solo por Tailscale Serve. Funnel apagado. PostgreSQL nunca expuesto.
- **UI:** capa opcional HTTP Basic (`APP_BASIC_AUTH`).
- **APIs oficiales únicamente:** Google Places API (New), Notion API, Overpass (OSM), Anthropic API. Sin scraping.
- **Términos de Google Maps Platform:** limitan cuánto tiempo se puede guardar contenido de Places (el `place_id` se puede guardar sin límite). Revisar los términos vigentes antes de usar los datos a escala; el campo `raw` guarda la respuesta original para poder refrescar o purgar.
- **Datos personales:** las reseñas incluyen nombres de autores. Snodic trabaja con prospectos en España → aplica RGPD. El primer contacto comercial por WhatsApp a negocios merece revisión legal humana (LSSI/RGPD). La app no envía mensajes: solo los prepara.
- **Costos:** Places API y Anthropic API son de pago por uso. Configurar cuotas y alertas de presupuesto en cada consola. La app no activa pagos por sí misma.
- **Backups:** el esquema `mapping` entra en el `pg_dump` diario existente (cifrado AES-256-GCM + Drive).
