# QA Smoke Checklist — Agent Flow

Checklist de release gate para la rama `cleanup/repo-health-dead-code`.
Última auditoría: 2026-06-11. HEAD de referencia: `ecf7447`.

## Commits recientes (lotes cerrados)

| Commit | Descripción |
|--------|-------------|
| `ecf7447` | fix(api): guard budget analyzer without income rows |
| `23bb727` | refactor(web): semantic interview call controls |
| `ab4656c` | docs: document budget chat ReAct deploy flag |
| `9161f5e` | fix(web): align interview CTA copy with 180s |
| `b0a4d0f` | feat(api): add basic ReAct loop for budget chat agent |
| `a17ad6a` | refactor(web): extract interview gate helper |
| `7599150` | chore: harden cleanup baseline with tests and verify |

## Validaciones automáticas (release gate)

| Check | Resultado | Notas |
|-------|-----------|-------|
| `git status` | Limpio | Sin WIP unstaged al auditar |
| `pnpm typecheck` | Verde | web + api |
| `pnpm test` | Verde | web 354 + api 622 |
| `pnpm --filter @financial-agent/web lint` | Verde | en verify previo a build |
| `pnpm verify` (full) | **Flaky** | Falla intermitente en `next build` por artefactos `.next` (`ENOENT` routes/pages-manifest). Build aislado (`next build` en `apps/web`) pasó en la misma sesión. Reintentar tras `rm -rf apps/web/.next` si persiste. |
| Secretos en docs | OK | Sin tokens reales |

## Invariantes críticas

| Invariante | Estado | Evidencia |
|------------|--------|-----------|
| `INTERVIEW_TOTAL_LIMIT_SEC === 180` | OK | `packages/shared/src/interview.constants.ts` |
| `INTERVIEW_MAX_CALLS_PER_USER === 1` | OK | `packages/shared/src/interview.constants.ts` |
| Gate entrevista: evidencia/skip + ≥3 filas `amount > 0` | OK | `interview-gate.helpers.ts`, tests `interview-gate.*` |
| 0/1/2 filas bloquean entrevista | OK | `interview-gate.helpers.test.ts`, `interview-gate.invariants.test.ts` |
| Cartolas no sustituyen 3 filas presupuesto | OK | Tests gate + `FLUJO_END_TO_END.md` |
| Skip cartolas no desbloquea sin 3 filas | OK | Tests gate |
| Chats 2/3 post diagnóstico | OK | `page.utils.test.ts`, `product-lifecycle.service.test.ts` |
| Fincoins / depletion | OK | `fincoin.service.ts`, `requireSpendableFincoins` en budget-chat routes |
| `react_trace` no expuesto al cliente | OK | `buildAgentChatReply` no incluye `react_trace`; grep vacío en `budget-chat.routes.ts` |
| MCP `finance.budget_analyzer` sin income ≤ 0 | OK | `budget-chat-react.tools.ts` → `no_income_rows`; test en `budget-chat-react.service.test.ts` |
| `BUDGET_CHAT_REACT_ENABLED` documentado | OK | `docs/DEPLOY_RAILWAY.md`, `docs/FLUJO_END_TO_END.md` |

## Smoke manual — producto

**Estado: pendiente manual** (sin navegador/dev server en sesión de auditoría automatizada).

Ejecutar en staging o local (`pnpm --filter @financial-agent/web dev` + API):

- [ ] `/agent` carga tras intake aprobado.
- [ ] Lectura base visible (cartolas + presupuesto en Chat 1).
- [ ] Skip cartolas → presupuesto disponible; entrevista **sigue bloqueada** con &lt;3 filas `amount > 0`.
- [ ] 0, 1, 2 filas con monto → entrevista bloqueada.
- [ ] 3 filas + evidencia TX o skip → entrevista disponible; CTA copy dice **máx. 3 min**.
- [ ] Modal entrevista: estado idle (CTA iniciar/reanudar).
- [ ] En llamada: controles `--live`, pausa, countdown **Finalizar en Xs** antes del umbral.
- [ ] Tras umbral: **Finalizar llamada** activo → confirmación **Confirmar y generar diagnóstico**.
- [ ] **Seguir en llamada** cancela confirmación.
- [ ] No aparece opción de extender/ampliar tiempo.
- [ ] Mobile pequeño: controles sticky no tapan acciones críticas.
- [ ] Post diagnóstico: Chats 2 y 3 desbloqueados.
- [ ] Fincoins agotados bloquean operaciones costosas (budget-chat, entrevista).

## Smoke manual — budget-chat ReAct (opcional)

- [ ] Con `BUDGET_CHAT_REACT_ENABLED=true`: respuesta presupuesto usa tools y cierra con `complete_turn`.
- [ ] Con flag `false`: comportamiento structured legacy.
- [ ] Tabla sin ingresos: análisis MCP no corre (`no_income_rows`).

## Riesgos restantes

1. **`pnpm verify` flaky** por caché `.next` — limpiar antes de CI/deploy.
2. **ReAct ON por defecto** en prod — monitorear latencia/costo; flag documentado en Railway.
3. **Smoke visual entrevista** — validar idle/live/mobile manualmente post-merge.
4. **Merge a `main`** — disparar deploy Railway y `pnpm prod:smoke` / `pnpm qa:smoke`.

## Comandos útiles

```bash
pnpm typecheck
pnpm test
pnpm --filter @financial-agent/web exec jest --watchAll=false
pnpm --filter @financial-agent/api test
pnpm verify   # si falla build, probar: rm -rf apps/web/.next && pnpm verify
pnpm prod:smoke
pnpm qa:smoke
```
