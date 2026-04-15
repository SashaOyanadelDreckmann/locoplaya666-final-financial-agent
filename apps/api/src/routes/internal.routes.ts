import { Router } from 'express';
import path from 'path';
import { readFile } from 'fs/promises';
import { requireAuth, requirePermission } from '../middleware/auth';
import { sendSuccess } from '../http/api.responses';
import { forbidden } from '../http/api.errors';
import { PERMISSIONS } from '../auth/rbac';
import { getAllHttpStats, getHttpGlobalStats } from '../observability/http-metrics';
import { getAllToolStats } from '../mcp/tools/telemetry';
import { HTTP_RATE_LIMIT_POLICIES } from '../http/rate-limit.policy';
import { DEFAULT_RATE_LIMITS as MCP_TOOL_RATE_LIMITS } from '../mcp/security/rate-limiter';

const router = Router();

function isInternalDocsEnabled() {
  // SECURITY: Disable all internal docs in production by default
  if (process.env.NODE_ENV === 'production') {
    // Only allow if explicitly enabled AND explicitly authenticated endpoint is added
    return false;
  }
  // Non-production: allow docs unless explicitly disabled
  return process.env.DISABLE_INTERNAL_DOCS !== 'true';
}

function resolveOpenApiPath() {
  return path.resolve(process.cwd(), 'apps/api/docs/openapi.yaml');
}

router.get('/docs/openapi.yaml', async (req, res, next) => {
  try {
    if (!isInternalDocsEnabled()) {
      throw forbidden('Internal docs are disabled');
    }
    const yaml = await readFile(resolveOpenApiPath(), 'utf-8');
    res.type('application/yaml').send(yaml);
  } catch (error) {
    next(error);
  }
});

router.get('/docs/swagger', (req, res, next) => {
  try {
    if (!isInternalDocsEnabled()) {
      throw forbidden('Internal docs are disabled');
    }
    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Financial Agent API - Swagger UI</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: '/internal/docs/openapi.yaml',
        dom_id: '#swagger-ui'
      });
    </script>
  </body>
</html>`;
    res.type('text/html').send(html);
  } catch (error) {
    next(error);
  }
});

router.get('/docs/redoc', (req, res, next) => {
  try {
    if (!isInternalDocsEnabled()) {
      throw forbidden('Internal docs are disabled');
    }
    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Financial Agent API - ReDoc</title>
    <script src="https://cdn.jsdelivr.net/npm/redoc@next/bundles/redoc.standalone.js"></script>
    <style>body { margin: 0; padding: 0; }</style>
  </head>
  <body>
    <redoc spec-url="/internal/docs/openapi.yaml"></redoc>
  </body>
</html>`;
    res.type('text/html').send(html);
  } catch (error) {
    next(error);
  }
});

router.get(
  '/observability',
  requireAuth,
  requirePermission(PERMISSIONS.OBSERVABILITY_READ),
  (req, res) => {
    return sendSuccess(res, {
      generatedAt: new Date().toISOString(),
      correlationId: req.correlationId,
      http: {
        global: getHttpGlobalStats(),
        endpoints: getAllHttpStats(),
      },
      mcpTools: getAllToolStats(),
      rateLimits: {
        httpPolicies: HTTP_RATE_LIMIT_POLICIES,
        mcpToolPolicies: MCP_TOOL_RATE_LIMITS,
      },
    });
  },
);

export default router;
