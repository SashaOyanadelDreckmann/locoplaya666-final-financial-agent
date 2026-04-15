// apps/api/src/server.ts
import { createApp } from './app';
import { getConfig, formatConfigSummary } from './config';
import { getLogger, logStartup, logShutdown } from './logger';
import { bootstrapMCP } from './mcp/bootstrap';

// Validate config at startup
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

// Initialize logger
const logger = getLogger();

// Log configuration
logger.info(formatConfigSummary(config));

// Create and start app
const app = createApp();

const server = app.listen(config.PORT, () => {
  logStartup(`API listening on http://localhost:${config.PORT}`);
});

// MCP bootstrap
try {
  bootstrapMCP();
  logger.info('MCP tools bootstrapped successfully');
} catch (err) {
  logger.error({ msg: 'MCP bootstrap failed', error: err });
  process.exit(1);
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logShutdown('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logShutdown('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});
