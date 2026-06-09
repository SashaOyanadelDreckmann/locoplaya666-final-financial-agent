# Deploy express a Railway

Este repo se despliega mejor como **2 servicios**:

- `financial-agent-api`
- `financial-agent-web`

## 1. Crear la base de datos

En Railway agrega un servicio **PostgreSQL**.

## 2. Crear servicio API

Configura el servicio con:

- Root directory: repo root
- Dockerfile path: `Dockerfile.api`

Variables mínimas:

- `NODE_ENV=production`
- `PORT=3001`
- `DATABASE_URL=${{Postgres.DATABASE_URL}}`
- `WEB_ORIGIN=https://TU-WEB.up.railway.app`
- `OPENAI_API_KEY=...`
- `OPENAI_MODEL=gpt-5.2`
- `OPENAI_VISION_MODEL=gpt-5.2`
- `TRANSACTIONS_RECONCILE_MODEL=gpt-5.2`
- `TRANSACTIONS_SUMMARY_MODEL=gpt-4.1-mini`
- `TRANSACTIONS_VISION_DETAIL=auto`
- `ANTHROPIC_API_KEY=...`
- `ANTHROPIC_MODEL=claude-sonnet-4-6`
- `SESSION_TOKEN_SECRET=pega-un-secret-de-32+-chars`
- `SESSION_COOKIE_SAME_SITE=none`
- `LOG_LEVEL=info`
- `DATA_DIR=/app/data`

Notas:

- `SESSION_COOKIE_SAME_SITE=none` es importante porque `web` y `api` estarán en dominios distintos.
- No habilitar `ENABLE_DEV_INJECTION` en producción.
- Ejecutar migraciones aparte del arranque del servicio:
  - `pnpm --filter @financial-agent/api db:migrate`
  - luego desplegar/reiniciar el API

## 3. Crear servicio Web

Configura el servicio con:

- Root directory: repo root
- Dockerfile path: `Dockerfile.web`

Variables mínimas:

- `NODE_ENV=production`
- `PORT=3000`
- `NEXT_PUBLIC_API_URL=https://TU-API.up.railway.app`
- `NEXT_PUBLIC_API_ORIGIN=https://TU-API.up.railway.app`
- `NEXT_PUBLIC_APP_ORIGIN=https://TU-WEB.up.railway.app`
- `OPENAI_API_KEY=...`
- `TRANSACTIONS_CHAT_MODEL=gpt-4o-mini`
- `DATA_DIR=/app/data`

Notas:

- Montar un **volume persistente** en `/app/data` (5 GB recomendado) para PDFs de burbuja, biblioteca y artefactos del agente.
- En Railway: `railway link -s keen-magic` → `railway volume add --mount-path /app/data` (repetir para el servicio API).

## 4. Volúmenes persistentes (producción)

| Servicio | Volume | Mount |
|---|---|---|
| keen-magic (web) | `keen-magic-volume` | `/app/data` |
| locoplaya666-final-financial-agent (api) | `locoplaya666-final-financial-agent-volume` | `/app/data` |
| Postgres | `postgres-volume` | `/var/lib/postgresql/data` |

Rutas con `DATA_DIR=/app/data`:

- Web: `bubble-reports/{userId}/` — PDFs desde burbujas de chat
- Web: `pdfs/{userId}/` — biblioteca local del frontend
- API: `pdfs/{userId}/` — artefactos servidos por `/api/pdfs/serve`

## 5. Smoke test

Healthchecks (usar en deploy y monitoreo):

- `GET https://TU-API.up.railway.app/health/live` — liveness (proceso arriba)
- `GET https://TU-API.up.railway.app/health/ready` — readiness (Postgres + MCP; **503** si DB caída)
- `GET https://TU-WEB.up.railway.app/health` — liveness web
- `GET https://TU-WEB.up.railway.app/health/ready` — readiness full-stack (web → API)

Script automatizado:

```bash
API_HEALTH_URL=https://TU-API.up.railway.app \
WEB_HEALTH_URL=https://TU-WEB.up.railway.app \
pnpm prod:smoke
```

Manual:

- Abre `https://TU-WEB.up.railway.app`
- Registra usuario
- Inicia sesión
- Ejecuta una interacción simple con el agente

## 6. Si falla login

Revisar en API:

- `WEB_ORIGIN` correcto
- `SESSION_COOKIE_SAME_SITE=none`
- Railway está usando HTTPS público
