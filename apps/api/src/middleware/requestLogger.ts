/**
 * requestLogger.ts
 *
 * Express middleware for request/response logging.
 * Adds correlation ID and logs request details.
 */

import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { createRequestLogger } from '../logger';
import { recordHttpMetric } from '../observability/http-metrics';
import { startHttpTrace } from '../observability/tracing';
import { sanitizeObject, sanitizeString } from './logSanitizer';

declare global {
  namespace Express {
    interface Request {
      correlationId: string;
      traceId?: string;
      spanId?: string;
      logger: ReturnType<typeof createRequestLogger>;
      startTime?: number;
    }
  }
}

export function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction): void {
  const correlationId = randomUUID();

  req.correlationId = correlationId;
  const trace = startHttpTrace({
    method: req.method,
    route: req.path,
    correlationId,
    traceparent: req.headers['traceparent'],
  });
  req.traceId = trace.traceId;
  req.spanId = trace.spanId;
  req.logger = createRequestLogger(correlationId, undefined, trace.traceId, trace.spanId);
  req.startTime = Date.now();

  res.setHeader('x-correlation-id', correlationId);
  res.setHeader('traceparent', `00-${trace.traceId}-${trace.spanId}-01`);

  // Log request (with sanitized sensitive data)
  req.logger.info({
    msg: 'http.request.start',
    method: req.method,
    path: req.path,
    route: sanitizeString(req.originalUrl),
    query: sanitizeObject(req.query),
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });

  // Intercept response finish to log response details
  res.on('finish', () => {
    const duration = req.startTime ? Date.now() - req.startTime : 0;
    const resolvedRoute =
      req.route && typeof req.route.path === 'string'
        ? `${req.baseUrl || ''}${req.route.path}`
        : req.path;

    recordHttpMetric({
      method: req.method,
      route: resolvedRoute,
      statusCode: res.statusCode,
      durationMs: duration,
      timestamp: Date.now(),
    });

    req.logger.info({
      msg: 'http.request.finish',
      method: req.method,
      path: req.path,
      route: resolvedRoute,
      statusCode: res.statusCode,
      durationMs: duration,
      contentLength: res.getHeader('content-length'),
    });

    trace.end({
      statusCode: res.statusCode,
      durationMs: duration,
    });
  });

  next();
}
