/**
 * logger.ts
 *
 * Centralized logging with Pino.
 * - Development: Pretty-printed human-readable
 * - Production: JSON structured logs
 * - All logs include request correlation IDs for tracing
 */

import pino from 'pino';
import type { Logger } from 'pino';
import { getConfig } from './config';

let _logger: Logger | null = null;

/**
 * Get or create the Pino logger instance.
 * Configuration adapts to NODE_ENV:
 * - dev: pretty printing with colors
 * - prod: compact JSON
 */
export function getLogger(): Logger {
  if (_logger) return _logger;

  const config = getConfig();
  const isDev = config.NODE_ENV === 'development';
  const isTest = config.NODE_ENV === 'test';

  const pinoConfig = {
    level: config.LOG_LEVEL,
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  const transport = isDev
    ? pino.transport({
        target: 'pino-pretty',
        options: {
          colorize: true,
          singleLine: false,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
          messageFormat: '{levelLabel} {msg}',
        },
      })
    : undefined;

  _logger = isTest ? pino({ level: 'silent' }) : pino(pinoConfig, transport);

  return _logger;
}

/**
 * Create a child logger with correlation ID context.
 * Used for request-scoped logging.
 */
export function createRequestLogger(
  correlationId: string,
  userId?: string,
  traceId?: string,
  spanId?: string,
) {
  const logger = getLogger();
  return logger.child({
    correlationId,
    ...(traceId && { traceId }),
    ...(spanId && { spanId }),
    ...(userId && { userId }),
  });
}

/**
 * Log application startup
 */
export function logStartup(message: string): void {
  getLogger().info(`🚀 ${message}`);
}

/**
 * Log application shutdown
 */
export function logShutdown(message: string): void {
  getLogger().info(`🛑 ${message}`);
}

export default getLogger();
