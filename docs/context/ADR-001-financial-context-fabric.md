# ADR-001: Financial Context Fabric (MCP)

## Estado

Aceptado — Fase 4 (Core, Budget, Transactions, Diagnostic/Interview, publish hooks)

## Contexto

Los agentes (Core, Budget, Transactions, Interview/Diagnostic) comparten datos financieros del usuario pero hoy los reciben por rutas distintas: payload del frontend, hidratación en `/api/agent`, `injectedIntake` en Postgres, memoria y panel state. Esto duplica tokens, dificulta detectar inconsistencias y mezcla estado visual con verdad canónica.

## Decisión

Introducir **Financial Context Fabric**: capa de dominio read-only con:

- Contratos compartidos (`packages/shared/src/context/`)
- Servicios de manifest, facts, packs, consistencia y versionado (`apps/api/src/context-fabric/`)
- Tools MCP `context.get_manifest` y `context.get_pack` (con `FINANCIAL_CONTEXT_MCP_ENABLED`, shadow o cualquier pack activo)
- Shadow mode en orchestrator con `FINANCIAL_CONTEXT_SHADOW_MODE` (construye pack y compara tokens; no altera `context_summary` salvo que `CORE_CONTEXT_PACK_ENABLED` también esté activo)
- Core pack aplicado en orchestrator **solo** con `CORE_CONTEXT_PACK_ENABLED` (default **on** en development)
- Budget, Transactions y Diagnostic/Interview reciben bloques canónicos compactos cuando sus flags están activos
- Publish hooks post-parse (`/api/documents/parse`), post-merge panel (`/api/merge-products-context`) y actualización de cuestionario (`PATCH /intake/update`) invalidan cache y auditan `context_fabric.source_published`
- `/api/session` expone `contextFabric` (versionado + conflictos si `CONTEXT_CONFLICT_UI_ENABLED=true`)

Los agentes **no** se invocan entre sí. Cada pipeline sigue siendo independiente; el fabric es datos estructurados + MCP, no conversación agente-a-agente.

## Recursos lógicos (URIs)

| URI | Owner | Persistencia |
|-----|-------|--------------|
| `financial://me/manifest` | Context Fabric | Derivado |
| `financial://me/intake` | Intake submit | `User.injectedIntake.intake` |
| `financial://me/budget/*` | Panel presupuesto | `panelState` + `injectedIntake.budgetContext` |
| `financial://me/transactions/*` | Modal transacciones | `injectedIntake.productsContext` |
| `financial://me/diagnostic` | Diagnostic agent | `injectedProfile` / `FinancialProfile` |
| `financial://me/lifecycle` | Product lifecycle | `memoryBlob.productLifecycle` |

## Feature flags (default: false)

- `FINANCIAL_CONTEXT_MCP_ENABLED`
- `FINANCIAL_CONTEXT_SHADOW_MODE`
- `CORE_CONTEXT_PACK_ENABLED`
- `BUDGET_CONTEXT_PACK_ENABLED`
- `TRANSACTIONS_CONTEXT_PUBLISH_ENABLED`
- `DIAGNOSTIC_CONTEXT_PACK_ENABLED`
- `CONTEXT_CONSISTENCY_ENABLED`
- `CONTEXT_CONFLICT_UI_ENABLED`

Con todas en `false` en **producción**, comportamiento legacy idéntico. En **development**, por defecto están activos: MCP, shadow, core pack, budget pack, transactions publish, diagnostic pack, consistencia y **conflict UI**.

### Matriz de flags (comportamiento real)

| Flag | MCP tools | Session `contextFabric` | Core pack apply | Shadow compare |
|------|-----------|-------------------------|-----------------|----------------|
| `FINANCIAL_CONTEXT_MCP_ENABLED` | sí | sí | no | no |
| `FINANCIAL_CONTEXT_SHADOW_MODE` | sí | sí | no | sí |
| `CORE_CONTEXT_PACK_ENABLED` | sí | sí | sí | sí |
| `CONTEXT_CONFLICT_UI_ENABLED` | no | sí | no | no |
| `TRANSACTIONS_CONTEXT_PUBLISH_ENABLED` | sí | sí | no | no |

`CONTEXT_CONSISTENCY_ENABLED` activa detección de conflictos en manifest/session sin registrar MCP tools por sí solo.

## Consecuencias

- Positivas: procedencia, deduplicación, packs por propósito, detección determinística de conflictos, rollback trivial.
- Negativas: superficie nueva a mantener; migración gradual por agente.
- Riesgos mitigados: fallback legacy; shadow antes de activar packs en producción; sin mutaciones vía MCP.

## Rollback

1. Poner flags en `false` y redeploy.
2. No hay migraciones de DB en Fase 1.
3. Eliminar logs `context_fabric.*` del dashboard si se desea.
