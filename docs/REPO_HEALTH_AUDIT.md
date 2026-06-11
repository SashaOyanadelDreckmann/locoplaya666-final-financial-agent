# Repo Health Audit — Fase 2/3

Auditoría read-only de arquitectura y candidatos a limpieza. **No se eliminó código** en esta fase.

Generado por Agente 3 (repo-health cartographer). Rama objetivo: `cleanup/repo-health-dead-code`.

---

## 1. Estado base

| Campo | Valor |
|--------|--------|
| **Branch** | `cleanup/repo-health-dead-code` |
| **HEAD (auditoría)** | `ecf7447d6523db6949f82b1014eb5cef14684df6` — `fix(api): guard budget analyzer without income rows` |
| **git status** | Limpio al inicio de la auditoría |
| **pnpm verify** | PASS en reintento completo (~102s). Un intento previo falló en suite API (posible flake de timing); `typecheck`, `lint`, `test:ci` web y API pasaron por separado antes del reintento exitoso |

### Commits recientes relevantes (contexto)

```
ecf7447 fix(api): guard budget analyzer without income rows
23bb727 refactor(web): semantic interview call controls
ab4656c docs: document budget chat ReAct deploy flag
9161f5e fix(web): align interview CTA copy with 180s
b0a4d0f feat(api): add basic ReAct loop for budget chat agent
```

---

## 2. Mapa del monorepo

### Workspace (`pnpm-workspace.yaml`)

- `apps/*`
- `packages/*`
- Sin `turbo.json` (orquestación vía scripts root en `package.json`)

### `apps/web` — Next.js 15 (App Router principal)

| Área | Ubicación | Notas |
|------|-----------|--------|
| Rutas App Router | `app/**/page.tsx` | 13 páginas: `/`, `/agent`, `/intake`, `/diagnosis`, `/interview`, auth, admin, analytics, budgetpreview, etc. |
| API routes (BFF) | `app/api/**/route.ts` | Proxy a Express: agent, budget-chat, documents, transcribe, pdfs, diagnosis |
| Agent UI | `app/agent/**` | Panel principal, modales (budget, tx, interview), hooks, tests |
| CSS modular | `app/agent*.css`, `app/agent-modals*.css` | ~116k líneas CSS agente (mucho cascade/`!important`) |
| Lib cliente | `lib/**` | api, intake, diagnosis-session, fincoin-gate, transactions helpers |
| Components | `components/**` | UI compartida + diagnosis + conversation |
| State (zustand) | `state/*.store.ts` | session, profile, interview |
| Pages Router (mínimo) | `pages/_app.tsx`, `pages/_document.tsx` | Shell vacío; coexistencia híbrida |
| Público | `public/**` | Iconos, fondos, manifest, sw.js |
| Middleware | `middleware.ts` | Auth paths, CSRF shell classes |

### `apps/api` — Express + Prisma

| Área | Ubicación | Notas |
|------|-----------|--------|
| Entry | `src/server.ts` → `src/app.ts` | Express, rate limits, CSRF, CORS |
| Rutas HTTP | `src/routes/*.ts` | auth, agent, budget-chat, documents, conversation, diagnosis, intake, transactions-chat, transcribe, health, internal, pdfs, analytics, simulations |
| Servicios | `src/services/**` | budget-chat agent/ReAct, fincoin, llm, memory, knowledge, parsers |
| Agentes | `src/agents/**` | core.agent orchestrator, diagnostic, welcome |
| MCP | `src/mcp/**` | tools, security, rate-limiter |
| Persistencia | `prisma/schema.prisma`, `src/persistence/**` | User, sessions, fincoins, diagnostic fields |
| QA scripts | `qa_smoke_ci.mjs` (activo), `qa_legacy/**` (17 scripts tracked) | Solo `qa:smoke` en package.json |
| OpenAPI | `docs/openapi.yaml` | Spec API local |

### `packages/shared`

33 módulos TS exportados vía `src/index.ts`: entrevista (`interview.constants`, `interview-voice-dossier`), budget-chat, transactions-chat, fincoin, welcome intro, evidence, chat lifecycle, agent stream/timeouts.

### Scripts root

| Script | Propósito |
|--------|-----------|
| `scripts/deploy-api.sh`, `deploy-web.sh` | Deploy Railway |
| `scripts/prod-smoke.mjs`, `prod-budget-e2e.*` | Smoke prod |
| `scripts/sync-latest.sh` | Sync remoto |
| `apps/web/scripts/smoke-transactions-modal.mjs` | Smoke tx modal |

### Docs (existentes, no modificados en lotes previos)

- `docs/FLUJO_END_TO_END.md` — flujo producto
- `docs/DEPLOY_RAILWAY.md` — deploy y flags ReAct
- `docs/API_GOVERNANCE.md` — gobernanza API

### Tests

| Paquete | Runner | Escala aprox. |
|---------|--------|----------------|
| API | Vitest | 622 tests / 66 files |
| Web | Jest | 354 tests / 79 suites |
| Shared | Vitest (en package) | tests en `packages/shared/src/__tests__` |
| Root | `pnpm verify` | typecheck + lint web + test + build web |

---

## 3. Entry points

### Next.js App Router

- `apps/web/app/layout.tsx` — carga global CSS + sync viewport/PWA
- `apps/web/app/agent/page.tsx` — **hub principal** post-login (chat 1, panel, modales)
- `apps/web/app/intake/page.tsx` — cuestionario inicial
- `apps/web/app/diagnosis/page.tsx` — informe diagnóstico
- `apps/web/app/interview/page.tsx` — redirect legacy → agent (documentado en FLUJO)
- BFF: `app/api/*/route.ts` → Express backend

### API Express

Montaje en `createApp()` (`apps/api/src/app.ts`):

- `/auth`, `/intake/submit`, `/api/agent`, `/api/budget-chat`, `/api/transactions-chat`
- `/api/documents`, `/conversation/voice/*`, `/diagnosis`, `/health`
- Middleware: auth, fincoin-guard (rutas de costo), CSRF, rate limits

### Prisma

- Schema: `apps/api/prisma/schema.prisma`
- Campos críticos: `User.latestDiagnosticCompletedAt`, fincoins, panel state JSON fields
- **No tocar migrations en limpieza** sin revisión dedicada

### Scripts / jobs

- `pnpm qa:smoke` → `apps/api/qa_smoke_ci.mjs`
- Deploy: `pnpm deploy:api`, `pnpm deploy:web`
- `qa_legacy/*` — scripts manuales Playwright/intake (sin wiring en CI actual)

---

## 4. Reglas críticas encontradas (VIVAS — no eliminar)

| Regla | Ubicación principal | Evidencia |
|-------|---------------------|-----------|
| **Lectura base (chat 1)** | `apps/web/app/agent/page.tsx`, `chat-thread-view.tsx`, `page.utils.ts` | UX states `baseReading`, `interviewAvailable`, `diagnosisCompleted` |
| **Gate entrevista (3 filas `amount > 0`)** | `apps/web/app/agent/interview-gate.helpers.ts` | `INTERVIEW_BUDGET_ROWS_REQUIRED = 3`; tests `interview-gate.*.test.ts` |
| **Evidencia transaccional / skip cartolas** | `interview-gate.helpers.ts`, `page.tsx` | `productsModuleSkipped` no sustituye 3 filas (tests invariants) |
| **Entrevista 180s** | `packages/shared/src/interview.constants.ts` | `INTERVIEW_TOTAL_LIMIT_SEC = 180`; API token route + web runtime |
| **1 llamada por usuario** | shared + `useInterviewVoiceRuntime.ts` + `agent.ts` token | `INTERVIEW_MAX_CALLS_PER_USER = 1` |
| **Chats 2/3 post diagnóstico** | `chat-lifecycle.constants.ts`, `page.tsx`, Prisma | `latestDiagnosticCompletedAt`, advisory unlock |
| **Fincoins / depletion** | `fincoin.service.ts`, `fincoin-guard.ts`, `use-fincoin-usage.ts` | Integration test `fincoin-guard.integration.test.ts` |
| **Persistencia panel** | `page.tsx`, `documents` routes, Prisma User fields | `injectedIntake`, `productsContext`, `budgetContext`, panel backup keys |
| **Budget chat ReAct + fallback** | `budget-chat-react.service.ts`, `budget-chat-agent.service.ts`, routes | Flag `BUDGET_CHAT_REACT_ENABLED`; MCP guard income (ecf7447) |

---

## 5. Tabla de candidatos

| Candidato | Tipo | Ubicación | Evidencia | Riesgo | Clasificación | Acción recomendada |
|-----------|------|-----------|-----------|--------|---------------|-------------------|
| `budget-chat-planner.service.ts` | Barrel re-export | `apps/api/src/services/` | `rg budget-chat-planner` → 0 imports en repo | Bajo | **DEMOSTRADO MUERTO** | Lote API: eliminar archivo; imports ya usan `budget-chat-agent.service` directo |
| `planBudgetAssistantTurn` / `planBudgetAssistantInit` | Funciones `@deprecated` | `budget-chat-agent.service.ts` | Solo referenciadas por planner barrel muerto; 0 call sites externos | Medio | **DEMOSTRADO MUERTO** | Eliminar en lote API tras confirmar 0 imports dinámicos; mantener `runBudgetChatAgent` |
| `getBudgetQuestionForId` | Función `@deprecated` | `apps/web/app/agent/budget-modal.helpers.ts` | `rg getBudgetQuestionForId` → solo definición; `getBudgetQuestionForRow` usado en `BudgetModal.tsx` | Bajo | **DEMOSTRADO MUERTO** | Eliminar función; actualizar guard test si lo menciona |
| `buildBudgetCategoryValidationQuestion` | Export `@deprecated` alias | `packages/shared/src/budget-chat-context.ts` | Solo delega a `buildBudgetMovementTypeValidationQuestion`; 0 imports del alias | Medio | **DEMOSTRADO MUERTO** | Eliminar alias en lote shared pequeño; verificar no export breaking |
| `ShaderAnimation` | Componente UI | `apps/web/components/ui/shader-animation.tsx` | `rg ShaderAnimation` → solo archivo propio; import `three` sin uso externo | Bajo | **DEMOSTRADO MUERTO** | Eliminar componente + evaluar dep `three` si no hay otros usos |
| `useLazyKatex`, `useLazyRecharts`, `useScrollAnimation` | Hooks | `apps/web/lib/hooks/` | 0 imports desde resto de `apps/web`; coverage 0% | Bajo | **DEMOSTRADO MUERTO** | Lote web hooks: borrar archivos tras grep final |
| `qa_legacy/*.mjs` (17 archivos) | Scripts QA manuales | `apps/api/qa_legacy/` | Tracked en git; no en `package.json`; no referenciados en CI/docs salvo carpeta | Medio | **DUDOSO** | Archivar en `docs/` o mover fuera de repo; no borrar sin confirmar con equipo QA |
| `pages/_app.tsx`, `pages/_document.tsx` | Pages Router mínimo | `apps/web/pages/` | Next híbrido puede requerirlos; build los incluye | Medio | **DUDOSO** | No borrar hasta confirmar `next build` sin pages dir |
| `apps/web/app/budgetpreview/page.tsx` | Ruta protegida | middleware + page | En `PROTECTED_PATHS`; propósito preview interno | Medio | **DUDOSO** | Auditar uso real antes de remover |
| CSS agente fragmentado (~20 archivos, ~116k LOC) | Estilos | `apps/web/app/agent*.css` | Todos importados en cascade (`layout.tsx`, `agent.css`); tests CSS guard | Alto | **VIVO** | Lote CSS: consolidación gradual, no borrado; medir duplicados con diff herramienta |
| `agent-modals-diagnostics.css` (~20k LOC) | CSS entrevista/diagnóstico | `apps/web/app/` | Import activo; overrides recientes 3-C | Alto | **VIVO** | Solo refactor visual con QA manual |
| `isAgentComposerEngaged` / `setAgentComposerEngaged` | Aliases deprecated | `mobile-viewport-sync.ts` | Re-export aliases; pueden tener call sites externos | Bajo | **DUDOSO** | Grep usages de alias legacy antes de remover |
| `model-policy.helpers` deprecated aliases | API helpers | `apps/api/src/agents/core.agent/helpers/` | `@deprecated` Haiku aliases | Bajo | **DUDOSO** | Verificar exports públicos MCP/core agent |
| `scripts/__pycache__/*.pyc` | Artefacto Python | `scripts/` | Presente en filesystem local; no listado en `git ls-files` | Bajo | **DUDOSO** | Añadir a `.gitignore` si aparece tracked (no borrar en este lote) |
| `apps/api/dist/**` | Build output | local | En filesystem; verificar `.gitignore` | Bajo | **DUDOSO** | Asegurar no tracked; no borrar producto |
| `apps/web/coverage/**` | Reporte Jest | local | Generado por `test:ci` | Bajo | **DUDOSO** | Ignorar en git; no es código producto |
| ReAct MCP `finance.budget_analyzer` | Tool MCP | `budget-chat-react.tools.ts` | Guard income fix ecf7447 | Alto | **VIVO** | Mantener; solo mejorar tests edge |
| Entrevista / gate / Fincoins | Reglas negocio | shared + web + api | Ver §4 | Crítico | **VIVO** | **Prohibido** en lotes de limpieza |

---

## 6. Candidatos NO borrados (en esta fase)

| Candidato | Motivo sospecha | Por qué no se borró | Evidencia faltante |
|-----------|-----------------|---------------------|-------------------|
| `qa_legacy/**` | Scripts viejos sin CI | Pueden usarse manualmente en debug onboarding | Confirmación equipo + inventario último uso |
| `pages/_app.tsx` | Pages Router residual | Next.js build híbrido | Experimento build sin `pages/` |
| `budgetpreview` | Ruta poco documentada | En middleware protegido | Uso en prod / diseño |
| CSS masivo agent | Duplicación probable | Imports activos + tests guard cascade | Mapa import-graph + visual diff |
| Aliases `@deprecated` en API | Nombres viejos Haiku | Pueden ser API estable interna | Lista completa de importers |
| `three` / `maplibre-gl` deps | Bundle weight | `mapcn-map-arc` usado en intake; `three` en scanner + shader muerto | Tree-shake analysis tras borrar shader |

---

## 7. Lotes futuros recomendados

### Lote bajo riesgo 1 — API dead exports

- Eliminar `budget-chat-planner.service.ts`
- Eliminar `planBudgetAssistantTurn` / `planBudgetAssistantInit` si grep confirma 0 refs
- Tests: `pnpm --filter @financial-agent/api test -- budget-chat`

### Lote bajo riesgo 2 — Web/shared deprecated helpers

- Eliminar `getBudgetQuestionForId`, hooks muertos en `lib/hooks/`, `ShaderAnimation`
- Eliminar alias `buildBudgetCategoryValidationQuestion` (shared)
- Tests: guards + `pnpm verify`

### Lote CSS candidates (medio riesgo)

- Inventariar imports `layout.tsx` vs `agent.css` vs modales
- Detectar reglas duplicadas entre `agent-modals-budget*.css` (múltiples archiers ~8k LOC)
- **Solo** con tests CSS existentes (`budget-pro-mobile.css.test.ts`, etc.) + QA visual

### Lote API candidates (medio)

- Revisar `qa_legacy` → mover a `docs/qa-archive/` o repo scripts externo
- Auditar exports `@deprecated` en `model-policy.helpers.ts`

### Lote Docs candidates

- Este archivo (`REPO_HEALTH_AUDIT.md`) como índice vivo
- Cross-link desde `API_GOVERNANCE.md` (sin duplicar FLUJO/DEPLOY)

---

## 8. Prohibiciones recordadas

- **No borrar candidatos DUDOSOS** sin evidencia adicional o QA
- **No tocar** `prisma/migrations` en limpieza casual
- **No tocar** gates entrevista, Fincoins, `latestDiagnosticCompletedAt`, chat lifecycle
- **No mezclar** limpieza con refactors de producto
- **No usar** `git add .` en lotes paralelos — staging explícito por carril

---

## 9. Herramientas no ejecutadas

- **knip / depcheck**: no configurados en repo; no instalados en esta fase
- **Análisis estático de CSS duplicado**: pendiente herramienta dedicada
- **Cobertura global**: Jest coverage web generado localmente; no umbral CI estricto en root

---

## 10. Changelog de este documento

| Fecha | HEAD | Notas |
|-------|------|-------|
| 2026-06-11 | `ecf7447` | Mapa inicial Fase 2/3; 0 eliminaciones |
