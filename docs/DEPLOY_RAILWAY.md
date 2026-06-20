# Deploy en Railway — Runbook

Runbook compacto para desplegar el monorepo **Financial Agent** en Railway como dos servicios independientes (API + Web). Para el funnel de producto ver [`docs/FLUJO_END_TO_END.md`](./FLUJO_END_TO_END.md).

## Servicios

| Servicio Railway | Rol | Dockerfile | Config file |
|------------------|-----|------------|-------------|
| `financial-agent-api` (ej. `locoplaya666-final-financial-agent`) | Express + Prisma + MCP | `Dockerfile.api` | `/railway.api.toml` |
| `financial-agent-web` (ej. `keen-magic`) | Next.js App Router | `Dockerfile.web` | `/railway.web.toml` |

En cada servicio: **Settings → Config file path** → ruta indicada arriba.

**Referencia de proyecto** (no son secretos; el token sí lo es):

```
RAILWAY_PROJECT_ID=<tu-project-id>
RAILWAY_ENVIRONMENT_ID=<tu-environment-id>
RAILWAY_SERVICE_ID=<tu-service-id-web>
```

> **Nunca versionar** `RAILWAY_API_TOKEN` ni otros tokens reales. Configurarlos solo en el secret store de Railway o en variables de entorno del entorno de CI/agente.

## 1. Base de datos

Agregar servicio **PostgreSQL** en Railway y enlazar `DATABASE_URL` al servicio API.

### Migraciones (antes o aparte del restart)

```bash
pnpm --filter @financial-agent/api db:migrate
```

Luego desplegar o reiniciar el API.

### Postgres / memoria

- Schema: `apps/api/prisma/schema.prisma`
- Migraciones versionadas: `apps/api/prisma/migrations/`
- Generar cliente: `pnpm --filter @financial-agent/api db:generate`
- Si `DATABASE_URL` falta en **no-producción**, la API puede usar persistencia en memoria salvo `ALLOW_MEMORY_FALLBACK=false`.
- En **producción**, el arranque falla si faltan `DATABASE_URL` o secretos de sesión seguros.

## 2. Variables de entorno — API

Root directory: repo root. Dockerfile: `Dockerfile.api`.

| Variable | Ejemplo / notas |
|----------|-----------------|
| `NODE_ENV` | `production` |
| `PORT` | `3001` |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `WEB_ORIGIN` | `https://TU-WEB.up.railway.app` |
| `OPENAI_API_KEY` | `<secret>` |
| `OPENAI_MODEL` | `gpt-5.2` |
| `OPENAI_MODEL_FAST` | `gpt-4.1-mini` |
| `ANTHROPIC_MODEL_FAST` | `claude-haiku-4-5` (core agent: classify + format) |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-6` |
| `TRANSACTIONS_VISION_MODEL` | `gpt-4.1-mini` (OCR cartolas, 1ª pasada) |
| `TRANSACTIONS_VISION_FALLBACK_MODEL` | `gpt-4.1` (retry si OCR incompleto) |
| `TRANSACTIONS_PROFILE_MODEL` | `gpt-4.1-mini` (cargo/abono, banco) |
| `TRANSACTIONS_RECONCILE_MODEL` | `gpt-4.1-mini` (income/expense por fila) |
| `TRANSACTIONS_VISION_DETAIL` | `high` |
| `TRANSACTIONS_SUMMARY_MODEL` | `gpt-4.1-mini` |
| `TRANSACTIONS_CHAT_MODEL` | `gpt-4.1-mini` |
| `BUDGET_CHAT_REACT_ENABLED` | `true` |
| `ANTHROPIC_API_KEY` | `<secret>` |
| `SESSION_TOKEN_SECRET` | secret de 32+ caracteres |
| `SESSION_COOKIE_SAME_SITE` | `none` (web y API en dominios distintos) |
| `LOG_LEVEL` | `info` |
| `DATA_DIR` | `/app/data` |
| `EXPRESS_JSON_LIMIT` | `170mb` (120 MB raw + base64 en JSON) |
| `DOCUMENT_PARSE_MAX_FILE_BYTES` | `125829120` (120 MB por archivo) |
| `DOCUMENT_PARSE_MAX_TOTAL_BYTES` | `125829120` (120 MB por lote) |

**Producción:** no habilitar `ENABLE_DEV_INJECTION`.

### Budget chat — ReAct (solo servicio API)

El asistente de presupuesto (`POST /api/budget-chat`) puede usar un loop ReAct antes del agente structured legacy. Detalle de producto en [`docs/FLUJO_END_TO_END.md`](./FLUJO_END_TO_END.md) (§ presupuesto).

| Variable | Comportamiento |
|----------|----------------|
| `BUDGET_CHAT_AGENT_ENABLED` | Si es `false`, desactiva todo el agente de presupuesto (ReAct y structured). |
| `BUDGET_CHAT_REACT_ENABLED` | Controla el loop ReAct dentro del agente. |

**Defaults en código (sin variable explícita):**

| Entorno | ReAct |
|---------|-------|
| `NODE_ENV=test` | **OFF** salvo `BUDGET_CHAT_REACT_ENABLED=true` |
| dev / prod | **ON** salvo `BUDGET_CHAT_REACT_ENABLED=false` o `BUDGET_CHAT_AGENT_ENABLED=false` |

**Recomendación Railway / producción (rollout conservador):**

```text
BUDGET_CHAT_REACT_ENABLED=false
```

Mantiene el agente structured legacy. Para activar ReAct en prod, setear explícitamente:

```text
BUDGET_CHAT_REACT_ENABLED=true
```

**Operación:**

- ReAct puede aumentar **latencia** y **costo de infra** (hasta 2 iteraciones LLM por defecto, `BUDGET_CHAT_REACT_MAX_ITERATIONS`; herramientas MCP opcionales como `finance.budget_analyzer`). Si ReAct falla o hace timeout, el sistema cae al structured legacy.
- **Fincoins:** sigue **un cargo** `budget.chat` por request (`requireSpendableFincoins` + `chargeFincoinOperation` antes del agente); ReAct no añade operación Fincoin extra por iteración.

Variables opcionales (no obligatorias en Railway): `BUDGET_CHAT_REACT_MAX_ITERATIONS`, `BUDGET_CHAT_REACT_TIMEOUT_MS`, `BUDGET_CHAT_AGENT_TIMEOUT_MS`, `BUDGET_CHAT_AGENT_MODEL`.

## 3. Variables de entorno — Web

Root directory: repo root. Dockerfile: `Dockerfile.web`.

| Variable | Ejemplo / notas |
|----------|-----------------|
| `NODE_ENV` | `production` |
| `PORT` | `3000` |
| `NEXT_PUBLIC_API_URL` | `https://TU-API.up.railway.app` |
| `NEXT_PUBLIC_API_ORIGIN` | `https://TU-API.up.railway.app` |
| `NEXT_PUBLIC_APP_ORIGIN` | `https://TU-WEB.up.railway.app` |
| `OPENAI_API_KEY` | `<secret>` |
| `TRANSACTIONS_CHAT_MODEL` | `gpt-4.1-mini` |
| `DATA_DIR` | `/app/data` |

## 4. Volúmenes persistentes

Montar volumen en **`/app/data`** (≈5 GB recomendado) en **API y Web**:

```bash
railway link -s <servicio>
railway volume add --mount-path /app/data
```

| Servicio | Uso con `DATA_DIR=/app/data` |
|----------|------------------------------|
| Web | `bubble-reports/{userId}/`, `pdfs/{userId}/` |
| API | `pdfs/{userId}/` servidos por `/api/pdfs/serve` |
| Postgres | volumen propio en `/var/lib/postgresql/data` |

> **Nombres heredados (ejemplo histórico, no mandato universal):** en entornos ya desplegados pueden existir volúmenes como `keen-magic-volume` (web), `locoplaya666-final-financial-agent-volume` (API) o `postgres-volume` (Postgres), todos montados en `/app/data` salvo Postgres (`/var/lib/postgresql/data`). Confirmar en Railway antes de renombrar o recrear.

## 5. Healthchecks

Configurados en `railway.api.toml` y `railway.web.toml` (`healthcheckPath = "/health/ready"`).

| Endpoint | Significado |
|----------|-------------|
| `GET /health/live` (API) | Liveness — proceso arriba |
| `GET /health/ready` (API) | Readiness — Postgres + MCP; **503** si DB caída |
| `GET /health` (Web) | Liveness web |
| `GET /health/ready` (Web) | Readiness full-stack (web → API) |

### Smoke automatizado (deploy / monitoreo)

```bash
API_HEALTH_URL=https://TU-API.up.railway.app \
WEB_HEALTH_URL=https://TU-WEB.up.railway.app \
pnpm prod:smoke
```

### QA smoke (registro → agente → evidencias)

Script: `apps/api/qa_smoke_ci.mjs`

```bash
pnpm qa:smoke
```

Valida: registro + intake hasta `/agent`, respuesta con evidencia de chart y PDF.

## 6. Troubleshooting — login / cookies

Si falla el login en producción, revisar en **API**:

- `WEB_ORIGIN` coincide con la URL pública del web
- `SESSION_COOKIE_SAME_SITE=none`
- Railway expone HTTPS público en ambos servicios

## 7. Automatización (GitHub Actions)

El deploy manual de este runbook convive con workflows de GitHub Actions. Revisar `.github/workflows/deploy-*.yml` (p. ej. `deploy-keen-magic.yml`, `deploy-api.yml`) como alternativa o complemento operativo. Este documento no modifica esos workflows.

## 8. Checklist deploy manual

- [ ] Postgres creado y `DATABASE_URL` en API
- [ ] `pnpm --filter @financial-agent/api db:migrate` ejecutado
- [ ] Secretos (`SESSION_TOKEN_SECRET`, API keys) en Railway, no en git
- [ ] `WEB_ORIGIN` y `NEXT_PUBLIC_*` alineados con URLs reales
- [ ] Volúmenes `/app/data` en API y Web
- [ ] `railway.api.toml` / `railway.web.toml` como config path
- [ ] `pnpm prod:smoke` verde
- [ ] Smoke manual: abrir web → registrar → login → interacción simple con agente
