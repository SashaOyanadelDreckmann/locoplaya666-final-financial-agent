import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireAdminRole } from '../middleware/auth';
import { USER_ROLES } from '../auth/rbac';
import { parseParams, parseQuery } from '../http/parse';
import { sendSuccess } from '../http/api.responses';
import { notFound } from '../http/api.errors';
import { asyncHandler } from '../middleware/errorHandler';
import {
  exportAnalyticsInteractionsCsv,
  exportAnalyticsUsersCsv,
  getAnalyticsUserActivity,
  listAnalyticsInteractions,
  listAnalyticsUsers,
  listResearchAnalytics,
} from '../services/analytics.service';

const router = Router();

const DateFilterSchema = z
  .string()
  .trim()
  .refine((value) => Number.isFinite(Date.parse(value)), 'Invalid date');

const AnalyticsRoleSchema = z.enum([
  USER_ROLES.USER,
  USER_ROLES.ANALYST,
  USER_ROLES.ADMIN,
] as const);

const BaseFiltersSchema = z.object({
  search: z.string().trim().max(200).optional(),
  role: AnalyticsRoleSchema.optional(),
  from: DateFilterSchema.optional(),
  to: DateFilterSchema.optional(),
});

const UsersQuerySchema = BaseFiltersSchema.extend({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  sortBy: z
    .enum(['createdAt', 'interactions', 'lastInteractionAt', 'knowledgeScore', 'documents'])
    .default('interactions'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

const InteractionsQuerySchema = BaseFiltersSchema.extend({
  mode: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(120),
  offset: z.coerce.number().int().min(0).default(0),
});

const UserParamsSchema = z.object({
  userId: z.string().trim().min(1).max(160),
});

const UserActivityQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  mode: z.string().trim().max(100).optional(),
  from: DateFilterSchema.optional(),
  to: DateFilterSchema.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(120),
  offset: z.coerce.number().int().min(0).default(0),
});

const ExportUsersQuerySchema = BaseFiltersSchema.extend({
  sortBy: z
    .enum(['createdAt', 'interactions', 'lastInteractionAt', 'knowledgeScore', 'documents'])
    .default('interactions'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

const ExportInteractionsQuerySchema = BaseFiltersSchema.extend({
  mode: z.string().trim().max(100).optional(),
});

const ResearchQuerySchema = z.object({
  role: AnalyticsRoleSchema.optional(),
  from: DateFilterSchema.optional(),
  to: DateFilterSchema.optional(),
});

router.get(
  '/users',
  requireAuth,
  requireAdminRole,
  asyncHandler(async (req, res) => {
    const query = parseQuery(UsersQuerySchema, req.query);
    const payload = await listAnalyticsUsers({
      search: query.search,
      role: query.role,
      from: query.from,
      to: query.to,
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
      sortBy: query.sortBy ?? 'interactions',
      sortOrder: query.sortOrder ?? 'desc',
    });
    return sendSuccess(res, payload);
  }),
);

router.get(
  '/interactions',
  requireAuth,
  requireAdminRole,
  asyncHandler(async (req, res) => {
    const query = parseQuery(InteractionsQuerySchema, req.query);
    const payload = await listAnalyticsInteractions({
      search: query.search,
      role: query.role,
      mode: query.mode,
      from: query.from,
      to: query.to,
      limit: query.limit ?? 120,
      offset: query.offset ?? 0,
    });
    return sendSuccess(res, payload);
  }),
);

router.get(
  '/users/:userId/activity',
  requireAuth,
  requireAdminRole,
  asyncHandler(async (req, res) => {
    const { userId } = parseParams(UserParamsSchema, req.params);
    const query = parseQuery(UserActivityQuerySchema, req.query);

    const payload = await getAnalyticsUserActivity({
      userId,
      search: query.search,
      mode: query.mode,
      from: query.from,
      to: query.to,
      limit: query.limit ?? 120,
      offset: query.offset ?? 0,
    });

    if (!payload) {
      throw notFound('User not found');
    }

    return sendSuccess(res, payload);
  }),
);

router.get(
  '/research',
  requireAuth,
  requireAdminRole,
  asyncHandler(async (req, res) => {
    const query = parseQuery(ResearchQuerySchema, req.query);
    const payload = await listResearchAnalytics({
      role: query.role,
      from: query.from,
      to: query.to,
    });

    return sendSuccess(res, payload);
  }),
);

router.get(
  '/export/users.csv',
  requireAuth,
  requireAdminRole,
  asyncHandler(async (req, res) => {
    const query = parseQuery(ExportUsersQuerySchema, req.query);
    const csv = await exportAnalyticsUsersCsv({
      search: query.search,
      role: query.role,
      from: query.from,
      to: query.to,
      sortBy: query.sortBy ?? 'interactions',
      sortOrder: query.sortOrder ?? 'desc',
    });

    const filename = `analytics_users_${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(csv);
  }),
);

router.get(
  '/export/interactions.csv',
  requireAuth,
  requireAdminRole,
  asyncHandler(async (req, res) => {
    const query = parseQuery(ExportInteractionsQuerySchema, req.query);
    const csv = await exportAnalyticsInteractionsCsv({
      search: query.search,
      role: query.role,
      mode: query.mode,
      from: query.from,
      to: query.to,
    });

    const filename = `analytics_interactions_${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(csv);
  }),
);

export default router;
