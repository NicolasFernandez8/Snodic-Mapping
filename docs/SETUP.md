# Instalación en la PC de Snodic

Requisitos ya presentes: Docker Desktop, contenedor `snodic-postgres` (PostgreSQL 17, base `snodic`, usuario `snodic_app`), red `snodic-postgres_default`, Tailscale.

> Nada de esto modifica los contenedores existentes. La app crea su propio esquema `mapping` dentro de la base `snodic`, que **queda incluido automáticamente en el backup diario** (`pg_dump` de toda la base).

## 1. Clonar
```powershell
cd C:\Users\Nico_\Snodic
git clone https://github.com/NicolasFernandez8/Snodic-Mapping mapping
cd mapping
copy .env.example .env
```
Editá `.env` (nunca lo subas a Git).

## 2. Permiso para crear el esquema (una sola vez)
`snodic_app` no es superusuario. Para que la migración pueda crear el esquema `mapping`, desde pgAdmin (como `postgres`):
```sql
GRANT CREATE ON DATABASE snodic TO snodic_app;
```
Después de migrar podés revocarlo (`REVOKE CREATE ON DATABASE snodic FROM snodic_app;`); el esquema queda con dueño `snodic_app`.

## 3. Construir y migrar
```powershell
docker compose build
docker compose --profile tools run --rm migrate
docker compose up -d web worker
```
Abrí http://localhost:3000.

## 4. Acceso remoto (gratis, sin tarjeta)

### 4a. Recomendado: Tailscale (privado)
```powershell
tailscale serve --bg --https=8445 http://127.0.0.1:3000
```
→ `https://nico.tailc83d1c.ts.net:8445/` desde tus dispositivos. **No** activar Funnel.

**Para tu compañero:** compartile solo la PC, sin darle acceso a toda tu red:
1. https://login.tailscale.com/admin/machines → máquina `nico` → `…` → **Share…** → ingresá su email.
2. Él instala Tailscale (gratis), acepta la invitación y entra a la misma URL.
3. Ve únicamente esa máquina. Podés revocarlo cuando quieras desde el mismo menú.

### 4b. Alternativa: Cloudflare quick tunnel (público)
Sin cuenta, sin dominio y sin tarjeta. La URL es pública, así que la protege solo el login de la app, y cambia cada vez que reinicia el contenedor:
```powershell
docker compose --profile tunnel up -d tunnel
docker logs snodic-mapping-tunnel 2>&1 | findstr trycloudflare
```
Un túnel con URL fija y Cloudflare Access necesita un dominio propio en Cloudflare, y Zero Trust puede pedir un medio de pago: no lo usamos por la regla de costo cero.

## 4c. Usuarios de la app
La app pide usuario y contraseña. Creá los administradores desde la PC. La contraseña se pide oculta y se guarda solo como hash, nunca en archivos:
```powershell
docker compose run --rm -it web npm run user -- create Nico admin
docker compose run --rm -it web npm run user -- create Ivan admin
```
Después se administran desde **Usuarios** en la app: crear, cambiar rol o contraseña y borrar. Otros comandos: `npm run user -- list | passwd <usuario> | role <usuario> admin|member | delete <usuario>`.

## 4d. Avisos a n8n (opcional)
En n8n: nuevo workflow → nodo **Webhook** (POST, path `snodic-mapping`) → por ejemplo un nodo de Telegram o email. En `.env`: `N8N_WEBHOOK_URL=http://n8n:5678/webhook/snodic-mapping`. Para que funcione con ese nombre, n8n tiene que estar en la red `snodic-postgres_default` (ya lo está). Eventos: `daily_summary`, `stage_changed`, `audit_viewed`.

## 4e. Mini-auditorías públicas
La página `/a/<código>` es la única que se ve sin login, y existe solo si alguien la publica desde la ficha. Para que el link funcione fuera de tu red, el prospecto tiene que poder llegar a la app: con Tailscale no puede, así que usá el quick tunnel (§4b) y poné esa URL en `APP_PUBLIC_URL`, o copiá el texto del análisis en el mensaje.

## 5. Modo 100 % gratuito (por defecto)

Snodic trabaja **sin gastos ni datos de facturación**. Todo lo que usa la app por defecto es gratis y sin tarjeta:

| Necesidad | Fuente gratuita |
|---|---|
| Localidades (Agente 1) | OpenStreetMap / Overpass API |
| Prospectos del rubro (Agente 1) | OpenStreetMap (hoteles, hostales, apartamentos, pensiones…) |
| Teléfono, web, email, Instagram (Agente 2) | Etiquetas de OpenStreetMap, cuando existen; si no, `-` |
| Link a Google Maps / reseñas | URL pública de búsqueda de Google Maps (sin clave) |
| Reseñas | Se pegan a mano en la ficha del prospecto (botón **Abrir en Google Maps** → copiar → **Pegar reseñas**) |
| Mensaje e informe (Agentes 3 y 4) | Modo manual: **Copiar prompt** → pegar en Claude → **Pegar respuesta** |
| Notion | API de Notion (gratis) |
| Mapa | Tiles de OpenStreetMap |

**No configurar** `GOOGLE_MAPS_API_KEY` ni `ANTHROPIC_API_KEY`: ambas requieren facturación. El código las soporta por si algún día se decide lo contrario, pero quedan apagadas.

### Notion (Agente 2, 3 y 4)
1. https://www.notion.so/my-integrations → Nueva integración interna “Snodic Mapping” → copiar el token.
2. En la base de prospectos del proyecto Snodic: `•••` → Conexiones → agregar “Snodic Mapping”.
3. ID de la base: en la URL `notion.so/<workspace>/<ID>?v=...` es el bloque de 32 caracteres.
4. `.env` → `NOTION_TOKEN=...` y `NOTION_DATABASE_ID=...`
5. Propiedades (ya configuradas para la base de Snodic):

   | Notion | Qué escribe la app |
   |---|---|
   | (título) | Nombre del local |
   | Business Days / Business Hours | Del horario de OSM: “Lunes a Domingo” / “12:30 a 16:00” |
   | Rating - Google … | Se carga a mano en la ficha (gratis no hay rating) |
   | Ready | ✓ cuando el mensaje y el informe están listos |
   | Location | Localidad mapeada (ej. “Alicante Centro”) |
   | Webpage · Phone · Email · Address | Datos de OSM (teléfono como `34624207288`) |
   | Contact Info | `instagram [] facebook` |
   | Area | Región que se está recorriendo |
   | Category | “Hotel”, “Hostel”, “Guest House / Hostal”, “Tourist Apartment”… |
   | Type | “Normal” |
   | URL Google Maps | Link a la ficha / búsqueda en Google Maps |

   No se tocan: Complete, ID, Num, Created time, Priority. Lo que no se encuentra queda `-` (o vacío si la columna es URL/teléfono/email/número).
   Si cambiás un nombre de columna: `NOTION_PROPERTY_MAP={"locality":"Ciudad"}` (campos: name, business_days, business_hours, rating, ready, locality, website, phone, address, contact_info, region, category, email, type, google_maps_url).
6. El cuerpo de cada página queda: **mensaje (Agente 3)**, dos renglones vacíos, **informe (Agente 4)**. Si corregís un texto desde la app, se reemplaza sin duplicar.

### IA para los agentes 3 y 4
`LLM_PROVIDER=manual` (por defecto y recomendado): no se llama a ninguna IA de pago. En la ficha tocás **Copiar prompt** (ya incluye las reseñas cargadas), lo pegás en tu app de Claude y pegás la respuesta en **Pegar respuesta**. La app la valida y la escribe en Notion.

## 6. Primer recorrido: Alicante

Fuente de prospectos: **OpenStreetMap** (ya viene elegida en Ajustes).
Ajustes → **Agregar región**:
- Provincia de Alicante por municipios: nombre `Alicante`, nivel 6 → dividir en 8.
- Solo la ciudad por barrios: nombre `Alicante`, nivel 8 → dividir en 10.
- Sectores propios (como los de Idealista, dibujados en tu My Maps): exportá tu mapa a KML y subilo.

Luego Panel → **Ejecutar pipeline ahora**, o esperá al cron diario (`WORKER_CRON`, por defecto 09:00 Europe/Madrid).

## 7. Volcar al My Maps
Mapa → **KML para My Maps** → en tu mapa: “Agregar capa → Importar”. (My Maps no permite escritura automática.)
