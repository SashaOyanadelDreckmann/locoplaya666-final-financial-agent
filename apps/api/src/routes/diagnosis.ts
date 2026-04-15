import { Router } from 'express';
import { loadProfile } from '../services/storage.service';
import { loadUserById } from '../services/user.service';
import { notFound } from '../http/api.errors';
import { sendSuccess } from '../http/api.responses';
import { asyncHandler } from '../middleware/errorHandler';
import { requireAuth, requirePermission } from '../middleware/auth';
import { PERMISSIONS } from '../auth/rbac';

const router = Router();

router.get(
  '/diagnosis/latest',
  requireAuth,
  requirePermission(PERMISSIONS.PROFILE_READ_SELF),
  asyncHandler(async (req, res) => {
    const user = req.authenticatedUser;
    if (!user?.id) {
      throw notFound('User not found');
    }

    const hydratedUser = await loadUserById(user.id);
    if (!hydratedUser) {
      throw notFound('User not found');
    }

    const latestProfileId = hydratedUser.latestDiagnosticProfileId;
    if (!latestProfileId) {
      throw notFound('No diagnosis found for this user');
    }

    const profile = await loadProfile(latestProfileId);
    if (!profile) {
      throw notFound('Stored diagnosis could not be loaded');
    }

    return sendSuccess(res, profile);
  }),
);

export default router;
