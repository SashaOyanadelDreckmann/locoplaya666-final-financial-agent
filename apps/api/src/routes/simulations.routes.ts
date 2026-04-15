import { Router } from 'express';
import { z } from 'zod';
import { readIndex, markSaved } from '../services/simulations/simulation.library';
import { requireAuth, requirePermission } from '../middleware/auth';
import { sendSuccess } from '../http/api.responses';
import { PERMISSIONS } from '../auth/rbac';
import { parseBody, parseParams } from '../http/parse';
import { unauthorized } from '../http/api.errors';

export const simulationsRouter = Router();

const SaveSimulationSchema = z.object({
  saved: z.boolean().optional(),
});

const SimulationIdParamsSchema = z.object({
  id: z.string().min(1),
});

simulationsRouter.get(
  '/',
  requireAuth,
  requirePermission(PERMISSIONS.SIMULATION_READ_SELF),
  (req, res) => {
    const user = req.authenticatedUser;
    if (!user?.id) {
      throw unauthorized('Not authenticated');
    }
    const idx = readIndex(user.id);
    return sendSuccess(res, idx);
  },
);

simulationsRouter.post(
  '/:id/save',
  requireAuth,
  requirePermission(PERMISSIONS.SIMULATION_WRITE_SELF),
  (req, res) => {
    const user = req.authenticatedUser;
    if (!user?.id) {
      throw unauthorized('Not authenticated');
    }
    const { id } = parseParams(SimulationIdParamsSchema, req.params);
    const { saved } = parseBody(SaveSimulationSchema, req.body ?? {});
    const updated = markSaved(user.id, id, saved ?? true);
    return sendSuccess(res, { artifact: updated });
  },
);
