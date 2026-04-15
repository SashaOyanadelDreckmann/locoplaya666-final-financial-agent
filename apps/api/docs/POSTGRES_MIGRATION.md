# Postgres Migration Guide

## Environment
- Set `DATABASE_URL` in `.env`.
- Set `SESSION_TOKEN_SECRET` to a strong secret.

## ORM
- Prisma schema: `apps/api/prisma/schema.prisma`
- Versioned SQL migration: `apps/api/prisma/migrations/20260414190000_init/migration.sql`

## Commands
- `pnpm --filter @financial-agent/api db:generate`
- `pnpm --filter @financial-agent/api db:migrate`

## Notes
- If `DATABASE_URL` is missing, API runs with in-memory fallback for local/test usage.
- In production, startup exits if `DATABASE_URL` or secure secrets are missing.
