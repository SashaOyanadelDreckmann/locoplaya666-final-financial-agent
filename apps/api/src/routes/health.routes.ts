import { Router } from 'express';

import { asyncHandler } from '../middleware/errorHandler';
import { sendSuccess } from '../http/api.responses';
import { getDodCoverage } from '../http/endpoint-manifest';
import { getLivenessReport, getReadinessReport, type ReadinessReport } from '../services/health.service';

export const healthRouter = Router();

function toPublicReadinessReport(report: ReadinessReport) {
  if (process.env.NODE_ENV !== 'production') return report;
  return {
    ready: report.ready,
    status: report.status,
    timestamp: report.timestamp,
  };
}

healthRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const liveness = getLivenessReport();
    return sendSuccess(res, {
      ...liveness,
      dod: getDodCoverage(),
    });
  }),
);

healthRouter.get(
  '/live',
  asyncHandler(async (_req, res) => {
    return sendSuccess(res, getLivenessReport());
  }),
);

healthRouter.get(
  '/ready',
  asyncHandler(async (_req, res) => {
    const report = await getReadinessReport();
    const statusCode = report.ready ? 200 : 503;
    return sendSuccess(res, toPublicReadinessReport(report), statusCode);
  }),
);
