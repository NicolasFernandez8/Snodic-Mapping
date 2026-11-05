# Contexto de infraestructura Snodic

> Fuente: documento de transferencia del usuario (2026-11-05). No verificado desde la nube: confirmar antes de usar. Sin secretos.

## PC principal (Windows, usuario `Nico_`, `C:\Users\Nico_\Snodic`)
| Servicio | Contenedor | Puerto local | Notas |
|---|---|---|---|
| PostgreSQL 17 | `snodic-postgres` | 127.0.0.1:5432 | base `snodic`, usuarios `postgres` / `snodic_app`, volumen `snodic_postgres_data`, red `snodic-postgres_default` |
| pgAdmin 9.18 | `snodic-pgadmin` | 127.0.0.1:5050 | conexión Windows con `GSS encmode=disable` |
| Portainer CE | `portainer` | 127.0.0.1:9443 | |
| n8n | `n8n` | 5678 | conectado a PostgreSQL con `snodic_app` |
| **Snodic-Mapping** | `snodic-mapping-web` / `-worker` | 127.0.0.1:3000 | este repo |

## Tailscale Serve (privado, Funnel apagado)
n8n `:443` · Portainer `:8443` · pgAdmin `:8444` · propuesta Snodic-Mapping `:8445`. Host `nico.tailc83d1c.ts.net`.

## Backups
- 14:00 `backup-postgres.ps1` → `pg_dump` custom → `C:\Users\Nico_\Snodic\backups\postgres` (retención 90 días).
- 14:15 `sync-backup-postgres.ps1` → cifra (`SNODIC01`, AES-256-GCM, scrypt; clave DPAPI) → `G:\Mi unidad\Snodic\Backups\PostgreSQL`.
- Restauración probada (hash coincidente, `pg_restore --list` OK). n8n tiene backups aparte.

## Organización
Notion (proyecto Snodic) para tareas y prospectos. Títulos de tareas en inglés, explicación en español, puntos Fibonacci.
