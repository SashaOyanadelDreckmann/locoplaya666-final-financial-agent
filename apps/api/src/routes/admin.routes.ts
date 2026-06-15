import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireAdminRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { parseParams } from '../http/parse';
import { sendSuccess } from '../http/api.responses';
import { notFound } from '../http/api.errors';
import { getAdminCockpitSnapshot } from '../services/admin-cockpit.service';
import { getAdminUserDossier } from '../services/admin.service';

const router = Router();

const UserParamsSchema = z.object({
  userId: z.string().trim().min(1).max(160),
});

router.get(
  '/cockpit',
  requireAuth,
  requireAdminRole,
  asyncHandler(async (_req, res) => {
    const payload = await getAdminCockpitSnapshot();
    return sendSuccess(res, payload);
  }),
);

router.get(
  '/users/:userId/dossier',
  requireAuth,
  requireAdminRole,
  asyncHandler(async (req, res) => {
    const { userId } = parseParams(UserParamsSchema, req.params);
    const payload = await getAdminUserDossier(userId);
    if (!payload) {
      throw notFound('User not found');
    }
    return sendSuccess(res, payload);
  }),
);

export default router;
