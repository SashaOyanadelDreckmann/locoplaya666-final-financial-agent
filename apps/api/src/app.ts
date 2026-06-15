import express from 'express';
import * as dotenv from 'dotenv';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

import { simulationsRouter } from './routes/simulations.routes';
import diagnosisRouter from './routes/diagnosis';
import { finalizeInterviewVoice, saveInterviewVoiceState } from './routes/conversation';
import { submitIntake } from './routes/intake';
import { authRouter } from './routes/auth';
import agentRouter from './routes/agent';
import budgetChatRouter from './routes/budget-chat.routes';
import documentsRouter from './routes/documents';
import { pdfsRouter } from './routes/pdfs.routes';
import internalRouter from './routes/internal.routes';
import transactionsChatRouter from './routes/transactions-chat';
import transcribeRouter from './routes/transcribe';
import analyticsRouter from './routes/analytics';
import adminRouter from './routes/admin.routes';
import { healthRouter } from './routes/health.routes';
import { requestLoggerMiddleware } from './middleware/requestLogger';
import { asyncHandler, errorHandlerMiddleware } from './middleware/errorHandler';
import { attachCsrfToken, isAllowedOrigin, validateCsrfToken } from './middleware/csrf';
import { getConfig } from './config';
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
  // Videos sent as base64 inflate ~1.37x, so 50 MB raw → ~70 MB JSON.
  const jsonBodyLimit = process.env.EXPRESS_JSON_LIMIT || '70mb';

  if (config.NODE_ENV === 'production') {
    // Required for secure cookies behind proxies (Heroku/Render/Nginx, etc.)
    app.set('trust proxy', 1);
  } else {
    // Dev: Next.js `/backend` proxy — keep req.ip stable for rate-limit keys.
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

  app.use(express.json({ limit: jsonBodyLimit }));
  app.use(cookieParser());

  // SECURITY: CSRF token attachment for all authenticated requests
  app.use(attachCsrfToken);

  // SECURITY: global rate limiter delegates errors to global problem+json handler.
  app.use(globalRateLimiter);

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        return callback(null, isAllowedOrigin(origin));
      },
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
  app.post(
    '/intake/submit',
    requireAuth,
    requirePermission(PERMISSIONS.AGENT_CHAT_SELF),
    asyncHandler(submitIntake),
  );

  // AGENT CORE
  app.use('/api/agent', chatRateLimiter);
  app.use('/api/budget-chat', chatRateLimiter, budgetChatRouter);
  app.use('/api/transactions-chat', chatRateLimiter, transactionsChatRouter);
  app.use('/api/transcribe', chatRateLimiter, transcribeRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api', agentRouter);
  app.use('/api/documents', documentsRateLimiter, documentsRouter);
  app.use('/api/pdfs', pdfsRouter);
  app.use('/internal', internalRouter);

  // HEALTH — /health, /health/live (liveness), /health/ready (readiness + DB ping)
  app.use('/health', healthRouter);

  // INTERVIEW VOICE
  app.post(
    '/conversation/voice/state',
    requireAuth,
    requirePermission(PERMISSIONS.AGENT_CHAT_SELF),
    saveInterviewVoiceState,
  );
  app.post(
    '/conversation/voice/finalize',
    requireAuth,
    requirePermission(PERMISSIONS.AGENT_CHAT_SELF),
    finalizeInterviewVoice,
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
