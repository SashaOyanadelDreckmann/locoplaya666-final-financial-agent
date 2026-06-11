# Repo Health — estado final

Auditoría y limpieza completada en `release/repo-health-final-review`. **No tocar `main`** hasta merge explícito.

---

## Resumen

| Métrica | Valor |
|---------|--------|
| **Rama** | `release/repo-health-final-review` |
| **`public/`** | ~3.5 MB (antes ~39 MB) |
| **`globals.css`** | −635 líneas (bloque `.home-essence` muerto) |
| **`pnpm verify`** | typecheck + lint + tests + build |

---

## Limpieza aplicada

### Assets y código muerto

- `apps/api/qa_legacy/` (17 scripts), Capacitor, `BillSection`, scripts con credenciales embebidas
- ~35 MB de assets huérfanos en `public/`
- `toLegacyErrorShape`, `/budgetpreview` → redirect server-side a `/agent`

### Entrevista (voz)

- Timer de cuota robusto: `startQuotaClock`, `buildPersistSnapshot` sin flush en llamada activa
- Botones de llamada ≥44px en mobile, grid de métricas 2 columnas &lt;480px
- Controles sticky con `safe-area-inset-bottom`

### UX premium (mobile + desktop)

- Home: glass header con safe-area, sin tilt 3D en touch, `prefers-reduced-motion` en sección problema
- Auth: `<form onSubmit>` en login/register (teclado móvil «Go»)
- Intake: pills `min-height: 44px`
- Agent mobile: touch targets HIG 44px en header y Fincoin toggle
- PWA: `start_url: "/"` en manifest

### Seguridad

- `scripts/prod-budget-e2e.ts` exige `API`, `EMAIL`, `PASS` por env

---

## QA activo

- `pnpm verify` — typecheck + lint + test + build
- `pnpm qa:smoke` — requiere API + web locales
- `pnpm prod:smoke` — healthchecks producción

---

## Docs canónicos

- `docs/FLUJO_END_TO_END.md` — flujo producto
- `docs/DEPLOY_RAILWAY.md` — deploy Railway
- `docs/API_GOVERNANCE.md` — gobernanza API
- `docs/QA_SMOKE_CHECKLIST.md` — checklist manual
