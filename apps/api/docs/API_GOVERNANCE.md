# API Governance Baseline (Sprint Freeze)

## 1) Feature Freeze Rule
- Scope: backend API (`apps/api/src`).
- During freeze: no new endpoints, no contract shape changes without approval.
- Allowed changes: security fixes, bug fixes, consistency refactors, validation hardening.

## 2) Unified HTTP Contract
- Success envelope:
  - `ok: true`
  - `data: <payload>`
  - `meta.correlationId` (when available)
- Error envelope:
  - `ok: false`
  - `error.code`
  - `error.message`
  - `error.timestamp`
  - `error.correlationId` (when available)
  - `error.details` (non-production only)

## 3) Error Catalog
- `BAD_REQUEST` → 400
- `VALIDATION_ERROR` → 422
- `UNAUTHORIZED` → 401
- `FORBIDDEN` → 403
- `NOT_FOUND` → 404
- `CONFLICT` → 409
- `RATE_LIMITED` → 429
- `INTERNAL_ERROR` → 500

## 4) AuthN/AuthZ Policy
- Session token only in `httpOnly` cookie.
- Session token stored as HMAC hash at rest.
- Session rotation enabled (`SESSION_ROTATE_INTERVAL_MINUTES`).
- RBAC enforced with permissions by route.

## 5) Definition of Done (per endpoint)
- Request validated with Zod.
- Response uses standard envelope.
- Auth and permission checks (if protected).
- Structured logging with correlation ID.
- Error path handled by global error middleware.
- Endpoint covered by at least one test scenario (happy path + failure path).
- Endpoint documented in OpenAPI (`apps/api/docs/openapi.yaml`).

## 6) Persistence Standard
- Primary persistence: Postgres via Prisma.
- Migrations are versioned under `apps/api/prisma/migrations`.
- Local JSON persistence for PII/financial state is prohibited.
