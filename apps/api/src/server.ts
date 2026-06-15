// apps/api/src/server.ts
import os from 'os';

import { createApp } from './app';
import { getConfig, formatConfigSummary } from './config';
import { getLogger, logStartup, logShutdown } from './logger';
import { bootstrapMCP } from './mcp/bootstrap';
import { verifyDatabaseAtStartup } from './services/health.service';
import { ensureDevTestUsers } from './services/dev-users.seed';

function resolveLanIPv4(): string | null {
  const nets = os.networkInterfaces();
  for (const entries of Object.values(nets)) {
    for (const net of entries ?? []) {
      if (net.family === 'IPv4' || net.family === 4) {
        if (!net.internal) return net.address;
      }
    }
  }
  return null;
}

function logLanDevBanner(port: number): void {
  const ip = resolveLanIPv4();
  if (!ip) return;
  // eslint-disable-next-line no-console
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Mobile / LAN dev
  Web:  http://${ip}:3000
  API:  http://${ip}:${port}
  Use the LAN web URL on your phone (not localhost).
  QA mobile: qa-mobile-local@financieramente.invalid
  Password:  Financieramente123!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

async function startServer(): Promise<void> {
  const config = getConfig();

  if (config.NODE_ENV === 'production') {
    if (!config.DATABASE_URL) {
      console.error('❌ DATABASE_URL is required in production');
      process.exit(1);
    }
    if (config.SESSION_TOKEN_SECRET === 'dev-only-session-secret-change-me') {
      console.error('❌ SESSION_TOKEN_SECRET must be changed in production');
      process.exit(1);
    }
    if (!config.OPENAI_API_KEY || config.OPENAI_API_KEY === 'test-openai-key') {
      console.error('❌ OPENAI_API_KEY must be configured in production');
      process.exit(1);
    }
    if (!config.ANTHROPIC_API_KEY || config.ANTHROPIC_API_KEY === 'test-anthropic-key') {
      console.error('❌ ANTHROPIC_API_KEY must be configured in production');
      process.exit(1);
    }
  }

  const logger = getLogger();
  logger.info(formatConfigSummary(config));

  if (config.NODE_ENV === 'production' && !config.RESEND_API_KEY?.trim()) {
    logger.warn({
      msg: 'RESEND_API_KEY is not configured — new user registrations will not send approval emails to admin',
      impact: 'Users remain in PENDING_APPROVAL until manually approved',
    });
  }

  try {
    bootstrapMCP();
    logger.info('MCP tools bootstrapped successfully');
  } catch (err) {
    logger.error({ msg: 'MCP bootstrap failed', error: err });
    process.exit(1);
  }

  try {
    await verifyDatabaseAtStartup();
    if (config.NODE_ENV === 'production') {
      logger.info('Database connectivity verified at startup');
    }
  } catch (err) {
    logger.error({ msg: 'Database connectivity check failed at startup', error: err });
    process.exit(1);
  }

  if (config.NODE_ENV === 'development') {
    try {
      await ensureDevTestUsers();
    } catch (err) {
      logger.warn({ msg: 'Dev test user seed failed', error: err });
    }
  }

  const app = createApp();
  const host = process.env.API_BIND_HOST?.trim() || '0.0.0.0';
  const server = app.listen(config.PORT, host, () => {
    logStartup(`API listening on http://${host}:${config.PORT}`);
    if (config.NODE_ENV === 'development') {
      logLanDevBanner(config.PORT);
    }
  });

  const shutdown = (signal: string) => {
    logShutdown(`${signal} received, shutting down gracefully`);
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
