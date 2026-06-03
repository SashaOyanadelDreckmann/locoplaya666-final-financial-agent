import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import {
  createUser,
  deleteUserAccount,
  findUserByEmail,
  updateUserAuthSecurity,
} from '../services/user.service';
import {
  clearSessionCookie,
  createSession,
  destroySession,
  getSessionCookieName,
  getSessionCookieOptions,
} from '../services/session.service';
import { accountPendingApproval, accountRejected, badRequest, conflict, unauthorized } from '../http/api.errors';
import { sendSuccess } from '../http/api.responses';
import { parseBody } from '../http/parse';
import { asyncHandler } from '../middleware/errorHandler';
import { getAuthenticatedUser } from '../middleware/auth';
import { USER_ROLES } from '../auth/rbac';
import { APPROVAL_STATUS } from '../auth/approval';
import {
  approveUserFromSignedToken,
  rejectUserFromSignedToken,
  sendApprovalRequestEmail,
} from '../services/approval.service';

export const authRouter = Router();

const RegisterSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().email(),
  password: z
    .string()
    .min(8)
    .max(128)
    .regex(/[A-Z]/, 'Password must include at least one uppercase letter')
    .regex(/[0-9]/, 'Password must include at least one number'),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function canBootstrapAdminFromLogin(): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  return process.env.ENABLE_BOOTSTRAP_ADMIN_LOGIN === 'true';
}

function getBootstrapAdminCredentials() {
  if (process.env.NODE_ENV !== 'production') {
    return {
      email: normalizeEmail(process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin@financieramente.local'),
      password: process.env.BOOTSTRAP_ADMIN_PASSWORD || 'Financieramente123!',
      name: (process.env.BOOTSTRAP_ADMIN_NAME ?? 'Administrador').trim() || 'Administrador',
    };
  }

  return {
    email: normalizeEmail(process.env.BOOTSTRAP_ADMIN_EMAIL ?? ''),
    password: process.env.BOOTSTRAP_ADMIN_PASSWORD ?? '',
    name: (process.env.BOOTSTRAP_ADMIN_NAME ?? 'Administrador').trim() || 'Administrador',
  };
}

async function ensureBootstrapAdminForCredentials(params: {
  email: string;
  password: string;
}) {
  if (!canBootstrapAdminFromLogin()) return;

  const { email: adminEmail, password: adminPassword, name: adminName } = getBootstrapAdminCredentials();

  if (!adminEmail || !adminPassword) return;
  if (normalizeEmail(params.email) !== adminEmail || params.password !== adminPassword) return;

  const adminPasswordHash = await bcrypt.hash(adminPassword, 12);
  const existing = await findUserByEmail(adminEmail);

  if (!existing) {
    await createUser({
      name: adminName,
      email: adminEmail,
      passwordHash: adminPasswordHash,
      role: USER_ROLES.ADMIN,
      approvalStatus: APPROVAL_STATUS.APPROVED,
      approvedAt: new Date().toISOString(),
      approvedByEmail: adminEmail,
    });
    return;
  }

  const alreadyMatchingRole = existing.role === USER_ROLES.ADMIN;
  const alreadyMatchingPassword = await bcrypt.compare(adminPassword, existing.passwordHash);
  if (alreadyMatchingRole && alreadyMatchingPassword) return;

  await updateUserAuthSecurity(existing.id, {
    role: USER_ROLES.ADMIN,
    passwordHash: adminPasswordHash,
    approvalStatus: APPROVAL_STATUS.APPROVED,
    approvedAt: new Date().toISOString(),
    approvedByEmail: adminEmail,
  });
}

function toPublicUser(user: Awaited<ReturnType<typeof createUser>>) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

authRouter.post('/register', asyncHandler(async (req, res) => {
  const data = parseBody(RegisterSchema, req.body);
  const existing = await findUserByEmail(data.email);
  if (existing) {
    throw conflict('User already exists');
  }

  const passwordHash = await bcrypt.hash(data.password, 12);
  const user = await createUser({
    name: data.name,
    email: data.email,
    passwordHash,
    approvalStatus: APPROVAL_STATUS.PENDING_APPROVAL,
  }).catch((error: unknown) => {
    if (error instanceof Error && error.message.toLowerCase().includes('already exists')) {
      throw conflict('User already exists');
    }
    throw error;
  });

  await sendApprovalRequestEmail({
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
  }).catch(() => {
    // Keep registration successful even if email provider is temporarily unavailable.
  });

  return sendSuccess(res, {
    user: toPublicUser(user),
    approvalStatus: user.approvalStatus,
    requiresApproval: user.approvalStatus !== APPROVAL_STATUS.APPROVED,
  });
}));

authRouter.post('/login', asyncHandler(async (req, res) => {
  const data = parseBody(LoginSchema, req.body);
  await ensureBootstrapAdminForCredentials(data);

  const user = await findUserByEmail(data.email);
  if (!user) {
    throw unauthorized('Invalid credentials');
  }

  const ok = await bcrypt.compare(data.password, user.passwordHash);
  if (!ok) {
    throw unauthorized('Invalid credentials');
  }

  if (user.approvalStatus === APPROVAL_STATUS.PENDING_APPROVAL) {
    throw accountPendingApproval('Cuenta pendiente de aprobación');
  }
  if (user.approvalStatus === APPROVAL_STATUS.REJECTED) {
    throw accountRejected('Cuenta rechazada');
  }

  const session = await createSession(user.id, { invalidateExisting: true });
  res.cookie(getSessionCookieName(), session.token, getSessionCookieOptions());

  return sendSuccess(res, {
    user: toPublicUser(user),
  });
}));

authRouter.get('/approve', asyncHandler(async (req, res) => {
  const token = String(req.query?.token ?? '').trim();
  if (!token) {
    throw badRequest('Missing token');
  }

  const result = await approveUserFromSignedToken(token);
  return sendSuccess(res, {
    approved: true,
    alreadyApproved: result.alreadyApproved,
    user: toPublicUser(result.user),
  });
}));

authRouter.get('/reject', asyncHandler(async (req, res) => {
  const token = String(req.query?.token ?? '').trim();
  if (!token) {
    throw badRequest('Missing token');
  }

  const result = await rejectUserFromSignedToken(token);
  return sendSuccess(res, {
    rejected: true,
    alreadyRejected: result.alreadyRejected,
    user: toPublicUser(result.user),
  });
}));

authRouter.post('/logout', asyncHandler(async (req, res) => {
  const token = req.cookies?.[getSessionCookieName()] as string | undefined;
  if (token) {
    await destroySession(token);
  }

  clearSessionCookie(res);
  return sendSuccess(res, { loggedOut: true });
}));

authRouter.delete('/account', asyncHandler(async (req, res) => {
  const user = await getAuthenticatedUser(req, res);
  if (!user) {
    throw unauthorized('UNAUTHORIZED');
  }

  const deleted = await deleteUserAccount(user.id);
  if (!deleted) {
    throw unauthorized('UNAUTHORIZED');
  }

  clearSessionCookie(res);
  return sendSuccess(res, { deleted: true });
}));

/** GET /auth/me — lightweight session check used by Next.js API routes. */
authRouter.get('/me', asyncHandler(async (req, res) => {
  const user = await getAuthenticatedUser(req, res);
  if (!user) {
    throw unauthorized('UNAUTHORIZED');
  }

  return sendSuccess(res, { userId: user.id });
}));
