import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { createUser, findUserByEmail } from '../services/user.service';
import {
  clearSessionCookie,
  createSession,
  destroySession,
  getSessionCookieName,
  getSessionCookieOptions,
} from '../services/session.service';
import { conflict, unauthorized } from '../http/api.errors';
import { sendSuccess } from '../http/api.responses';
import { parseBody } from '../http/parse';
import { asyncHandler } from '../middleware/errorHandler';
import { getAuthenticatedUser } from '../middleware/auth';

export const authRouter = Router();

const RegisterSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

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
  }).catch((error: unknown) => {
    if (error instanceof Error && error.message.toLowerCase().includes('already exists')) {
      throw conflict('User already exists');
    }
    throw error;
  });

  const session = await createSession(user.id, { invalidateExisting: true });
  res.cookie(getSessionCookieName(), session.token, getSessionCookieOptions());

  return sendSuccess(res, {
    user: toPublicUser(user),
  });
}));

authRouter.post('/login', asyncHandler(async (req, res) => {
  const data = parseBody(LoginSchema, req.body);

  const user = await findUserByEmail(data.email);
  if (!user) {
    throw unauthorized('Invalid credentials');
  }

  const ok = await bcrypt.compare(data.password, user.passwordHash);
  if (!ok) {
    throw unauthorized('Invalid credentials');
  }

  const session = await createSession(user.id, { invalidateExisting: true });
  res.cookie(getSessionCookieName(), session.token, getSessionCookieOptions());

  return sendSuccess(res, {
    user: toPublicUser(user),
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

/** GET /auth/me — lightweight session check used by Next.js API routes. */
authRouter.get('/me', asyncHandler(async (req, res) => {
  const user = await getAuthenticatedUser(req, res);
  if (!user) {
    throw unauthorized('UNAUTHORIZED');
  }

  return sendSuccess(res, { userId: user.id });
}));
