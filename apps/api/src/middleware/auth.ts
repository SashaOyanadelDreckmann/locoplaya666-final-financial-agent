import type { Request, Response, NextFunction } from 'express';
import { hasPermission, USER_ROLES, type Permission, type UserRole } from '../auth/rbac';
import { accountPendingApproval, accountRejected, unauthorized, forbidden } from '../http/api.errors';
import {
  getSessionCookieName,
  getSessionCookieOptions,
  getSessionWithOptionalRotation,
} from '../services/session.service';
import { loadUserById } from '../services/user.service';
import { APPROVAL_STATUS } from '../auth/approval';

declare global {
  namespace Express {
    interface Request {
      authenticatedUser?: Awaited<ReturnType<typeof loadUserById>>;
    }
  }
}

export async function getAuthenticatedUser(req: Request, res?: Response) {
  const cookieName = getSessionCookieName();
  const token = req.cookies?.[cookieName] as string | undefined;
  if (!token) return null;

  const { session, rotatedSession } = await getSessionWithOptionalRotation(token);
  if (!session) return null;

  if (rotatedSession && res) {
    res.cookie(cookieName, rotatedSession.token, getSessionCookieOptions());
  }

  const user = await loadUserById(session.userId);
  return user;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await getAuthenticatedUser(req, res);
    if (!user) {
      throw unauthorized('Not authenticated');
    }
    if (user.approvalStatus === APPROVAL_STATUS.PENDING_APPROVAL) {
      throw accountPendingApproval('Cuenta pendiente de aprobación');
    }
    if (user.approvalStatus === APPROVAL_STATUS.REJECTED) {
      throw accountRejected('Cuenta rechazada');
    }

    req.authenticatedUser = user;
    next();
  } catch (error) {
    next(error);
  }
}

export function requirePermission(permission: Permission) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const user = req.authenticatedUser;
      if (!user) {
        throw unauthorized('Not authenticated');
      }

      if (!hasPermission(user.role, permission)) {
        throw forbidden(`Missing permission: ${permission}`);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireRole(...roles: UserRole[]) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const user = req.authenticatedUser;
      if (!user) {
        throw unauthorized('Not authenticated');
      }

      if (!roles.includes(user.role)) {
        throw forbidden('Insufficient role');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

export const requireAdminRole = requireRole(USER_ROLES.ADMIN);
