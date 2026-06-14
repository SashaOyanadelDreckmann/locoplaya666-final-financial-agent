# Estructura del repositorio

Mapa rápido de carpetas con nombres en español. Los imports públicos vía `@financial-agent/shared` y `@/lib/*` no cambian salvo rutas profundas documentadas abajo.

## Monorepo

```
apps/
  api/          Backend Fastify + agentes + persistencia
  web/          Frontend Next.js
packages/
  shared/       Tipos y lógica compartida web ↔ API
scripts/
  despliegue/   deploy Railway (API + web)
  qa/           smoke tests y E2E
  mantenimiento/ sync, prune CSS, utilidades de repo
```

## Backend (`apps/api/src/`)

| Carpeta | Rol |
|---------|-----|
| `orquestador/` | Flujos de entrevista y voz |
| `persistencia/` | Repos Postgres / memoria |
| `agents/` | Agentes (core, intake, diagnostic, welcome) |
| `routes/` | Rutas HTTP |
| `services/` | Lógica de dominio |

## Frontend — página agente (`apps/web/app/agent/`)

| Carpeta | Rol |
|---------|-----|
| `modales/` | presupuesto, transacciones, entrevista, cuenta, cuestionario, fincoins, comunes |
| `paneles/` | side panels, intro, carrusel |
| `chat/` | hilo, header, uploads |
| `flujo/` | onboarding, welcome, interview-gate |
| `arranque/` | boot sequence |
| `utilidades/` | constants, page.utils, panel-state |
| Raíz | `page.tsx`, `layout.tsx`, `page.flow.ts` (rutas Next) |

## Frontend — estilos (`apps/web/app/estilos/`)

| Carpeta | Rol |
|---------|-----|
| `agente/` | núcleo, chat, paneles, shell, arranque, fincoins |
| `modales/` | presupuesto, transacciones, diagnóstico, comunes |
| `sistema/` | backdrop, viewport, visual-modes |
| `tipografia/` | gradient text |

Entry: `layout.tsx` → `estilos/agente/agent.css`.

## Frontend — librería (`apps/web/lib/`)

| Carpeta | Rol |
|---------|-----|
| `agente/` | cliente HTTP/stream del agente |
| `api/` | base, cliente, envelope (+ barrel `lib/api.ts`) |
| `sesion/` | auth, CSRF, intake |
| `transacciones/` | flujo, evidencia, upload |
| `presupuesto/` | filas del presupuesto |
| `diagnostico/` | sesión y textos |
| `interfaz/` | viewport, visual mode, home scroll |
| `compartido/` | utils, artifacts, rate limit, etc. |
| `tipos/` | tipos compartidos |

## Frontend — componentes (`apps/web/components/`)

| Carpeta | Rol |
|---------|-----|
| `inicio/` | landing home (Counter, NumbersCanvas, SpotlightCard) |
| `marca/` | BrandWordmark |
| `diagnostico/` | UI de diagnóstico |
| `agente/` | piezas del agente |
| `conversacion/` | burbujas y chat |
| `layout/` | sync viewport, chrome, shell |
| `ui/` | primitivos reutilizables |

## Shared (`packages/shared/src/`)

| Carpeta | Rol |
|---------|-----|
| `agente/` | stream, timeouts |
| `chat/` | history, pipelines, lifecycle, closure |
| `presupuesto/` | rows, chat context/focus/session, schema |
| `transacciones/` | chat TX, planner, evidence |
| `entrevista/` | constants, voice dossier |
| `fincoins/` | constants |
| `flujo/` | action-plan funnel |
| `interfaz/` | ui-events |
| `intake/` | cuestionario |
| `welcome/` | intro cache y copy |

Barrel: `import { … } from '@financial-agent/shared'`.

Rutas profundas habituales:

- `@financial-agent/shared/src/intake/intake-questionnaire.types`
- `@financial-agent/shared/src/interfaz/ui-events`

## Home (`apps/web/app/page.tsx`)

Landing con scroll Framer Motion, secciones sticky (problema, features, stats, steps, CTA). Viewport móvil vía `@/lib/interfaz/viewport-mode`. Scroll en `.mobile-scale-frame` preparado en `@/lib/interfaz/home-scroll-context` (usar `HomeScrollRoot` / `useHomeScroll` si el scroll del frame debe gobernar animaciones).
