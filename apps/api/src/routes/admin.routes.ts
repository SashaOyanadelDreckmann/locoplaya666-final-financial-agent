import { Router } from 'express';
import type { Request } from 'express';
import { z } from 'zod';
import { USER_ROLES } from '../auth/rbac';
import { requireAuth, requireAdminRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { parseBody, parseParams, parseQuery } from '../http/parse';
import { sendSuccess } from '../http/api.responses';
import { badRequest, forbidden, notFound } from '../http/api.errors';
import { getAdminCockpitSnapshot } from '../services/admin-cockpit.service';
import {
  getAdminUserDossier,
  getAdminUserSnapshot,
  listAdminArchiveUsers,
  listAdminUsersFullDump,
} from '../services/admin.service';
import {
  ADMIN_AUDIT_ACTIONS,
  listAdminAuditEntries,
  logAdminAudit,
} from '../services/admin-audit.service';
import { approveUserByAdmin, rejectUserByAdmin } from '../services/approval.service';
import { loadUserById, updateUserAuthSecurity } from '../services/user.service';

const router = Router();

const UserParamsSchema = z.object({
  userId: z.string().trim().min(1).max(160),
});

const ArchiveUsersQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(40),
  offset: z.coerce.number().int().min(0).default(0),
});

const AuditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(80),
  offset: z.coerce.number().int().min(0).default(0),
});

const RoleBodySchema = z.object({
  role: z.enum([USER_ROLES.USER, USER_ROLES.ANALYST, USER_ROLES.ADMIN] as const),
});

function actorFromRequest(req: Request) {
  const user = req.authenticatedUser;
  if (!user) {
    throw forbidden('Admin required');
  }
  return user;
}

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
  '/users',
  requireAuth,
  requireAdminRole,
  asyncHandler(async (req, res) => {
    const query = parseQuery(ArchiveUsersQuerySchema, req.query);
    const payload = await listAdminArchiveUsers({
      search: query.search,
      limit: query.limit ?? 40,
      offset: query.offset ?? 0,
    });
    return sendSuccess(res, payload);
  }),
);

router.get(
  '/users/full',
  requireAuth,
  requireAdminRole,
  asyncHandler(async (req, res) => {
    const actor = actorFromRequest(req);
    logAdminAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: ADMIN_AUDIT_ACTIONS.ARCHIVE_EXPORT,
      meta: { route: '/api/admin/users/full' },
    });
    const payload = await listAdminUsersFullDump();
    return sendSuccess(res, payload);
  }),
);

router.get(
  '/users/:userId/snapshot',
  requireAuth,
  requireAdminRole,
  asyncHandler(async (req, res) => {
    const { userId } = parseParams(UserParamsSchema, req.params);
    const actor = actorFromRequest(req);
    const payload = await getAdminUserSnapshot(userId);
    if (!payload) {
      throw notFound('User not found');
    }
    logAdminAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: ADMIN_AUDIT_ACTIONS.ARCHIVE_USER_VIEW,
      targetUserId: userId,
    });
    return sendSuccess(res, payload);
  }),
);

router.get(
  '/users/:userId/dossier',
  requireAuth,
  requireAdminRole,
  asyncHandler(async (req, res) => {
    const { userId } = parseParams(UserParamsSchema, req.params);
    const actor = actorFromRequest(req);
    const payload = await getAdminUserDossier(userId);
    if (!payload) {
      throw notFound('User not found');
    }
    logAdminAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: ADMIN_AUDIT_ACTIONS.DOSSIER_VIEW,
      targetUserId: userId,
    });
    return sendSuccess(res, payload);
  }),
);

router.post(
  '/users/:userId/approve',
  requireAuth,
  requireAdminRole,
  asyncHandler(async (req, res) => {
    const { userId } = parseParams(UserParamsSchema, req.params);
    const actor = actorFromRequest(req);
    const result = await approveUserByAdmin({
      userId,
      adminEmail: actor.email,
    });
    logAdminAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: ADMIN_AUDIT_ACTIONS.USER_APPROVE,
      targetUserId: userId,
      meta: { alreadyApproved: result.alreadyApproved },
    });
    return sendSuccess(res, result);
  }),
);

router.post(
  '/users/:userId/reject',
  requireAuth,
  requireAdminRole,
  asyncHandler(async (req, res) => {
    const { userId } = parseParams(UserParamsSchema, req.params);
    const actor = actorFromRequest(req);
    if (actor.id === userId) {
      throw badRequest('No puedes rechazar tu propia cuenta');
    }
    const result = await rejectUserByAdmin({
      userId,
      adminEmail: actor.email,
    });
    logAdminAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: ADMIN_AUDIT_ACTIONS.USER_REJECT,
      targetUserId: userId,
      meta: { alreadyRejected: result.alreadyRejected },
    });
    return sendSuccess(res, result);
  }),
);

router.patch(
  '/users/:userId/role',
  requireAuth,
  requireAdminRole,
  asyncHandler(async (req, res) => {
    const { userId } = parseParams(UserParamsSchema, req.params);
    const body = parseBody(RoleBodySchema, req.body);
    const actor = actorFromRequest(req);

    if (actor.id === userId && body.role !== USER_ROLES.ADMIN) {
      throw badRequest('No puedes degradar tu propio rol de administrador');
    }

    const target = await loadUserById(userId);
    if (!target) {
      throw notFound('User not found');
    }

    const updated = await updateUserAuthSecurity(userId, { role: body.role });
    if (!updated) {
      throw badRequest('Failed to update role');
    }

    logAdminAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: ADMIN_AUDIT_ACTIONS.USER_ROLE_CHANGE,
      targetUserId: userId,
      meta: { from: target.role, to: body.role },
    });

    return sendSuccess(res, {
      user: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        role: updated.role,
      },
    });
  }),
);

router.get(
  '/audit-log',
  requireAuth,
  requireAdminRole,
  asyncHandler(async (req, res) => {
    const query = parseQuery(AuditQuerySchema, req.query);
    const payload = listAdminAuditEntries({
      limit: query.limit ?? 80,
      offset: query.offset ?? 0,
    });
    return sendSuccess(res, payload);
  }),
);

export default router;
