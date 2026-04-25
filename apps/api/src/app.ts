import express from 'express';
import * as dotenv from 'dotenv';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

import { simulationsRouter } from './routes/simulations.routes';
import diagnosisRouter from './routes/diagnosis';
import conversationNext from './routes/conversation';
import { submitIntake } from './routes/intake';
import { authRouter } from './routes/auth';
import agentRouter from './routes/agent';
import documentsRouter from './routes/documents';
import { pdfsRouter } from './routes/pdfs.routes';
import internalRouter from './routes/internal.routes';
import { requestLoggerMiddleware } from './middleware/requestLogger';
import { asyncHandler, errorHandlerMiddleware } from './middleware/errorHandler';
import { attachCsrfToken, validateCsrfToken } from './middleware/csrf';
import { getConfig } from './config';
import { sendSuccess } from './http/api.responses';
import { getDodCoverage } from './http/endpoint-manifest';
import { requireAuth, requirePermission } from './middleware/auth';
import { PERMISSIONS } from './auth/rbac';
import {
  authRateLimiter,
  chatRateLimiter,
  documentsRateLimiter,
  globalRateLimiter,
  simulationsRateLimiter,
} from './http/rate-limit.policy';
import { notFound } from './http/api.errors';

dotenv.config();

export function createApp() {
  const config = getConfig();
  const app = express();

  if (config.NODE_ENV === 'production') {
    // Required for secure cookies behind proxies (Heroku/Render/Nginx, etc.)
    app.set('trust proxy', 1);
  }

  // Request logging first: correlation ID + trace context for all subsequent middleware.
  app.use(requestLoggerMiddleware);

  app.use(
    helmet({
      // API-only server; keep defaults, avoid blocking local embedding/preview.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
    })
  );

  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());

  // SECURITY: CSRF token attachment for all authenticated requests
  app.use(attachCsrfToken);

  // SECURITY: global rate limiter delegates errors to global problem+json handler.
  app.use(globalRateLimiter);

  app.use(
    cors({
      origin: config.WEB_ORIGIN,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Dev-Admin-Token', 'X-CSRF-Token'],
      exposedHeaders: ['X-CSRF-Token'],
    })
  );

  // SECURITY: CSRF token validation for state-changing operations
  app.use(validateCsrfToken);

  // AUTH
  app.use('/auth', authRateLimiter, authRouter);

  // INTAKE
  app.post('/intake/submit', asyncHandler(submitIntake));

  // AGENT CORE
  app.use('/api/agent', chatRateLimiter);
  app.use('/api', agentRouter);
  app.use('/api/documents', documentsRateLimiter, documentsRouter);
  app.use('/api/pdfs', pdfsRouter);
  app.use('/internal', internalRouter);

  // HEALTH
  app.get('/health', (_req, res) => {
    return sendSuccess(res, { status: 'ok', dod: getDodCoverage() });
  });

  // CONVERSATION (legacy / flujo anterior)
  app.post(
    '/conversation/next',
    requireAuth,
    requirePermission(PERMISSIONS.AGENT_CHAT_SELF),
    conversationNext,
  );

  // DIAGNOSIS
  app.use('/', diagnosisRouter);

  app.use('/simulations', simulationsRateLimiter, simulationsRouter);

  // 404 fallthrough (must pass through global error handler)
  app.use((req, _res, next) => {
    next(notFound(`Route not found: ${req.method} ${req.originalUrl}`));
  });

  // Global error handler (must be LAST)
  app.use(errorHandlerMiddleware);

  return app;
}
