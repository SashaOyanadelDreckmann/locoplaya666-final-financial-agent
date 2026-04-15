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
- `ANTHROPIC_API_KEY=...`
- `ANTHROPIC_MODEL=claude-sonnet-4-6`
- `SESSION_TOKEN_SECRET=pega-un-secret-de-32+-chars`
- `SESSION_COOKIE_SAME_SITE=none`
- `LOG_LEVEL=info`
- `DATA_DIR=/app/data`

Notas:

- `SESSION_COOKIE_SAME_SITE=none` es importante porque `web` y `api` estarán en dominios distintos.
- No habilitar `ENABLE_DEV_INJECTION` en producción.

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
- `DATA_DIR=/app/data`

## 4. Orden recomendado

1. Despliega Postgres.
2. Despliega API.
3. Copia la URL pública de API.
4. Configura y despliega Web.
5. Vuelve a API y actualiza `WEB_ORIGIN` con la URL final de Web si cambió.

## 5. Smoke test

- `GET https://TU-API.up.railway.app/health`
- Abre `https://TU-WEB.up.railway.app`
- Registra usuario
- Inicia sesión
- Ejecuta una interacción simple con el agente

## 6. Si falla login

Revisar en API:

- `WEB_ORIGIN` correcto
- `SESSION_COOKIE_SAME_SITE=none`
- Railway está usando HTTPS público
