# API Governance — Baseline

Política compacta para endpoints en `apps/api/src`. El contrato técnico vivo sigue en **`apps/api/docs/openapi.yaml`** (no eliminar).

## Feature freeze (referencia)

- Scope: backend API (`apps/api/src`).
- Durante freeze: sin endpoints nuevos ni cambios de contrato sin aprobación.
- Permitido: fixes de seguridad, bugs, refactors de consistencia, endurecimiento de validación.

## Envelope HTTP unificado

**Éxito:**

```json
{
  "ok": true,
  "data": "<payload>",
  "meta": { "correlationId": "<id>" }
}
```

`meta.correlationId` cuando esté disponible.

**Error:**

```json
{
  "ok": false,
  "error": {
    "code": "<CODE>",
    "message": "<mensaje>",
    "timestamp": "<iso>",
    "correlationId": "<id>",
    "details": "<solo no-producción>"
  }
}
```

## Catálogo de errores

| Código | HTTP |
|--------|------|
| `BAD_REQUEST` | 400 |
| `VALIDATION_ERROR` | 422 |
| `UNAUTHORIZED` | 401 |
| `FORBIDDEN` | 403 |
| `NOT_FOUND` | 404 |
| `CONFLICT` | 409 |
| `RATE_LIMITED` | 429 |
| `INTERNAL_ERROR` | 500 |

## AuthN / AuthZ

- Token de sesión solo en cookie `httpOnly`.
- Hash HMAC del token en reposo.
- Rotación de sesión (`SESSION_ROTATE_INTERVAL_MINUTES`).
- RBAC con permisos por ruta.

## Definition of Done (por endpoint)

- [ ] Request validado con Zod
- [ ] Response con envelope estándar
- [ ] Auth y permisos (si aplica)
- [ ] Logging estructurado con correlation ID
- [ ] Errores vía middleware global
- [ ] Al menos un test (happy + failure)
- [ ] Documentado en OpenAPI (`apps/api/docs/openapi.yaml`)

## Persistencia

- Primaria: Postgres vía Prisma.
- Migraciones: `apps/api/prisma/migrations`.
- Persistencia local JSON para PII/estado financiero: **prohibida**.
