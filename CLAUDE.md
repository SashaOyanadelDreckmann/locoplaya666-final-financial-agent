# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Architecture Overview

**Financieramente** is a full-stack AI financial advisory platform. It is a pnpm monorepo with three packages:

- `apps/web` — Next.js 14 App Router frontend (`@financial-agent/web`)
- `apps/api` — Express.js backend (`@financial-agent/api`)
- `packages/shared` — Shared TypeScript types and constants (`@financial-agent/shared`)

### Frontend (`apps/web`)

The app uses Next.js App Router. Key areas:
- `/app/agent/` — Main chat interface. The agent communicates via SSE (Server-Sent Events) streaming from `/backend/agent`. The frontend proxies all `/backend/*` requests to the API via Next.js rewrites configured in `next.config.js`.
- `/app/intake/`, `/app/diagnosis/` — Onboarding flow before the agent chat.
- `/app/login/`, `/app/register/` — Session-based auth.
- `/components/` — Shared UI components. Animated variants use Framer Motion. `ui/` contains a WebGL shader animation component using Three.js.
- `/lib/` — Client-side logic: `agent.ts` (SSE client), `api.ts` (fetch wrapper with CSRF), `financialCatalog.ts`, `diagnosis.i18n.ts`.
- `/state/` — Zustand stores for global UI and agent state.

State is managed with Zustand. Markdown messages support KaTeX math rendering. PDF export uses `html2pdf.js`.

### Backend (`apps/api`)

Entry point: `src/server.ts` → `src/app.ts`. Key subsystems:
- **Agents** (`src/agents/`): `interviewer.agent.ts` drives the main financial interview using Anthropic Claude (claude-sonnet-4-6). `followup.agent.ts` handles follow-ups.
- **LLM** (`src/services/llm.service.ts`): Wraps both Anthropic and OpenAI. Model config comes from env vars.
- **RAG** (`src/services/rag.service.ts`, `knowledge.service.ts`): Retrieval-augmented generation using OpenAI vector stores (`UserVectorStore` in Prisma).
- **Documents** (`src/services/document-intelligence.service.ts`): Parses uploaded PDFs, Excel, CSV files. `transactionParser.service.ts` extracts structured transactions.
- **MCP** (`src/mcp/`): Model Context Protocol tools bootstrapped on server start.
- **Orchestrator** (`src/orchestrator/interview.flow.ts`): Coordinates the interview lifecycle.
- **Auth**: Session-based via `express-session`, CSRF via double-submit cookie pattern (`src/middleware/csrf.ts`).
- **Persistence**: Prisma + PostgreSQL. In-memory fallback for development without a DB.
- **Observability**: Pino structured logging, OpenTelemetry tracing (`src/observability/`).

### Shared Package (`packages/shared`)

Contains constants and types used by both apps: chat lifecycle phases, interview constants, UI event types, and intake schemas. Import as `@financial-agent/shared`.

### Database

Prisma schema at `apps/api/prisma/schema.prisma`. Key models: `User`, `Session`, `UserDocument`, `UserVectorStore`, `FinancialProfile`. PostgreSQL required in production; development can run without it using the in-memory persistence fallback.

---

## Commands

```bash
# Run both apps in dev mode (concurrently)
pnpm dev

# Run individual apps
pnpm --filter @financial-agent/web dev
pnpm --filter @financial-agent/api dev

# Build
pnpm --filter @financial-agent/web build
pnpm --filter @financial-agent/api build

# Typecheck (run before deploying)
pnpm --filter @financial-agent/web typecheck
pnpm --filter @financial-agent/api typecheck

# Lint & format (frontend)
pnpm --filter @financial-agent/web lint
pnpm --filter @financial-agent/web format

# Tests — frontend (Jest + jsdom)
pnpm --filter @financial-agent/web test
pnpm --filter @financial-agent/web test -- --testPathPattern=login  # single file/pattern

# Tests — backend (Vitest)
pnpm --filter @financial-agent/api test
pnpm --filter @financial-agent/api test -- --reporter=verbose knowledge.service  # single file

# API smoke tests
pnpm --filter @financial-agent/api qa:smoke

# Database migrations
pnpm --filter @financial-agent/api db:migrate
pnpm --filter @financial-agent/api db:generate
```

### Important build notes

- `next.config.js` sets `ignoreBuildErrors: true` and `ignoreDuringBuilds: true` — TypeScript and ESLint errors do not fail the Next.js build, but they will fail `typecheck` and `lint` scripts. Always run `typecheck` before shipping.
- The frontend proxies `/backend/*` to the API. In local dev the API runs on port 3001 by default (`NEXT_PUBLIC_API_ORIGIN`).

---

## Environment Variables

Copy `.env.example` to `.env` in `apps/api/`. Key variables:

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Required for agent (Claude) |
| `OPENAI_API_KEY` | Required for RAG / GPT fallback |
| `DATABASE_URL` | PostgreSQL. Omit to use in-memory persistence. |
| `SESSION_TOKEN_SECRET` | Session signing secret |
| `OPENAI_MODEL` | Defaults to `gpt-5.2` |
| `ANTHROPIC_MODEL` | Defaults to `claude-sonnet-4-6` |

---

## Deploy on Railway

Two Railway services: `financial-agent-api` and `financial-agent-web` (aka `keen-magic`).

Live URL: https://financieramente.up.railway.app

```
RAILWAY_PROJECT_ID:     6a535ffc-9224-4db3-b385-adf8f2bf0218
RAILWAY_ENVIRONMENT_ID: 240cefd8-f924-4b76-a890-771db0a45a91
RAILWAY_SERVICE_ID:     304ec087-4411-4ced-a42c-e00d451fcf4e  (web / keen-magic)
```

**Deploy from CLI** (requires `RAILWAY_API_TOKEN` env var):
```bash
railway link --project 6a535ffc-9224-4db3-b385-adf8f2bf0218 \
             --environment 240cefd8-f924-4b76-a890-771db0a45a91 \
             --service 304ec087-4411-4ced-a42c-e00d451fcf4e
railway up --service 304ec087-4411-4ced-a42c-e00d451fcf4e --detach

# Check deploy status
railway deployment list --service 304ec087-4411-4ced-a42c-e00d451fcf4e --limit 3
```

**Auto-deploy via GitHub Actions:** `.github/workflows/deploy-keen-magic.yml` triggers on push to `main` for `apps/web/**`. GitHub secret is `RAILWAY_TOKEN`.

**For remote Claude Code sessions:** Add `RAILWAY_API_TOKEN=02bb6b8c-fc64-4bb6-876b-8b13ed085761` to the environment at https://code.claude.com → Settings → Environments.

Merge feature branches to `main` to trigger Railway deployment.
