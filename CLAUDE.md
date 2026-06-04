# CLAUDE.md — Contexto de sesión para Claude Code

Este archivo es leído automáticamente por Claude Code al inicio de cada sesión.

---

## Deploy en Railway

El proyecto se despliega en **Railway** con dos servicios:
- `financial-agent-api`
- `financial-agent-web` (aka `keen-magic`) → https://financieramente.up.railway.app

### IDs de Railway
```
RAILWAY_PROJECT_ID:     6a535ffc-9224-4db3-b385-adf8f2bf0218
RAILWAY_ENVIRONMENT_ID: 240cefd8-f924-4b76-a890-771db0a45a91
RAILWAY_SERVICE_ID:     304ec087-4411-4ced-a42c-e00d451fcf4e  (web / keen-magic)
```

### IMPORTANTE — Token de Railway en sesiones remotas

Para que Claude pueda hacer deploy desde una sesión de Claude Code en la web,
configurar el token solo como variable de entorno (no guardarlo en el repo):

```
RAILWAY_API_TOKEN=<set-in-environment-secret-store>
```

**Cómo configurarlo (una sola vez):**
1. Ve a https://code.claude.com → Settings → Environments
2. Edita el entorno que usas para este repo
3. Agrega `RAILWAY_API_TOKEN = <valor-del-secret-manager>`
4. Reinicia la sesión → Claude podrá deployar sin necesidad de que lo escribas

**Cómo hacer deploy una vez que el token está disponible:**
```bash
railway link --project 6a535ffc-9224-4db3-b385-adf8f2bf0218 \
             --environment 240cefd8-f924-4b76-a890-771db0a45a91 \
             --service 304ec087-4411-4ced-a42c-e00d451fcf4e
railway up --service 304ec087-4411-4ced-a42c-e00d451fcf4e --detach
```

**Alternativa — GitHub Actions:**
El workflow `.github/workflows/deploy-keen-magic.yml` se dispara automáticamente
con cada push a `main` en paths de `apps/web/**`. También se puede lanzar
manualmente desde la pestaña Actions en GitHub.

El secret en GitHub se llama `RAILWAY_TOKEN`.

---

## Rama de desarrollo

- Rama activa para features: `claude/home-animation-design-aArDO`
- Siempre mergear a `main` para que Railway despliegue

## Stack

- **Frontend**: Next.js 14 (App Router) en `apps/web/`
- **Backend**: Node/Express en `apps/api/`
- **Shared**: Tipos compartidos en `packages/shared/`
- **Package manager**: pnpm workspaces

## Comandos útiles

```bash
# Typecheck del web antes de deployar
pnpm --filter @financial-agent/web typecheck

# Dev local
pnpm --filter @financial-agent/web dev

# Ver estado del deploy
railway deployment list --service 304ec087-4411-4ced-a42c-e00d451fcf4e --limit 3
```
