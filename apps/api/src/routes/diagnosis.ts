import { Router } from 'express';
import type { Request, Response } from 'express';
import { resolveUserDiagnosticProfile } from '../services/diagnostic-profile.service';
import { notFound } from '../http/api.errors';
import { sendSuccess } from '../http/api.responses';
import { asyncHandler } from '../middleware/errorHandler';
import { requireAuth, requirePermission } from '../middleware/auth';
import { PERMISSIONS } from '../auth/rbac';

const router = Router();

async function loadLatestDiagnosis(req: Request, res: Response) {
  const user = req.authenticatedUser;
  if (!user?.id) {
    throw notFound('User not found');
  }

  const profile = await resolveUserDiagnosticProfile(user);
  if (!profile) {
    throw notFound('No diagnosis found for this user');
  }

  return sendSuccess(res, profile);
}

router.get(
  '/diagnosis/latest',
  requireAuth,
  requirePermission(PERMISSIONS.PROFILE_READ_SELF),
  asyncHandler(loadLatestDiagnosis),
);

router.get(
  '/api/diagnosis/latest',
  requireAuth,
  requirePermission(PERMISSIONS.PROFILE_READ_SELF),
  asyncHandler(loadLatestDiagnosis),
);

export default router;
