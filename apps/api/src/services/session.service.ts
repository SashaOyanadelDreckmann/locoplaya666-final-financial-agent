import crypto from 'crypto';
import type { Response, CookieOptions } from 'express';
import {
  createSessionRecord,
  deleteSessionByTokenHash,
  deleteSessionsByUserId,
  getSessionByTokenHash,
  purgeExpiredSessions,
} from '../persistence/repos';

export type SessionRecord = {
  token: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
};

type CreateSessionOptions = {
  invalidateExisting?: boolean;
  rotatedFromToken?: string;
};

function getCookieName() {
  return process.env.SESSION_COOKIE_NAME?.trim() || 'session';
}

function getTokenSecret() {
  return process.env.SESSION_TOKEN_SECRET?.trim() || 'dev-only-session-secret-change-me';
}

function hashToken(token: string): string {
  return crypto.createHmac('sha256', getTokenSecret()).update(token).digest('hex');
}

function getSessionTtlMs() {
  const ttlDays = Number(process.env.SESSION_TTL_DAYS ?? '7');
  const clamped = Number.isFinite(ttlDays) ? Math.max(1, ttlDays) : 7;
  return clamped * 86_400_000;
}

function nowIso() {
  return new Date().toISOString();
}

function parseMs(dateIso: string) {
  const parsed = Date.parse(dateIso);
  return Number.isFinite(parsed) ? parsed : 0;
}

function shouldRotate(session: SessionRecord): boolean {
  const rotateIntervalMinutes = Number(process.env.SESSION_ROTATE_INTERVAL_MINUTES ?? '30');
  const intervalMs = Number.isFinite(rotateIntervalMinutes)
    ? Math.max(5, rotateIntervalMinutes) * 60_000
    : 30 * 60_000;

  const createdMs = parseMs(session.createdAt);
  if (!createdMs) return true;

  return Date.now() - createdMs >= intervalMs;
}

export function getSessionCookieName() {
  return getCookieName();
}

export function getSessionCookieOptions(): CookieOptions {
  const isProd = process.env.NODE_ENV === 'production';
  const sameSiteRaw = process.env.SESSION_COOKIE_SAME_SITE?.trim().toLowerCase();
  const sameSite: CookieOptions['sameSite'] =
    sameSiteRaw === 'strict' || sameSiteRaw === 'none' || sameSiteRaw === 'lax'
      ? sameSiteRaw
      : 'lax';

  return {
    httpOnly: true,
    secure: isProd || sameSite === 'none',
    sameSite,
    maxAge: getSessionTtlMs(),
    path: '/',
    ...(process.env.SESSION_COOKIE_DOMAIN ? { domain: process.env.SESSION_COOKIE_DOMAIN } : {}),
  };
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(getSessionCookieName(), {
    ...getSessionCookieOptions(),
    maxAge: 0,
    expires: new Date(0),
  });
}

export async function createSession(userId: string, options?: CreateSessionOptions): Promise<SessionRecord> {
  if (options?.invalidateExisting) {
    await deleteSessionsByUserId(userId);
  }

  const token = crypto.randomBytes(32).toString('base64url');
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + getSessionTtlMs()).toISOString();
  const tokenHash = hashToken(token);

  await createSessionRecord({
    tokenHash,
    userId,
    createdAt,
    expiresAt,
    rotatedFromHash: options?.rotatedFromToken ? hashToken(options.rotatedFromToken) : undefined,
  });

  return { token, userId, createdAt, expiresAt };
}

export async function loadSession(token: string): Promise<SessionRecord | null> {
  if (!token) return null;

  await purgeExpiredSessions(nowIso());

  const row = await getSessionByTokenHash(hashToken(token));
  if (!row) return null;

  if (parseMs(row.expiresAt) <= Date.now()) {
    await deleteSessionByTokenHash(hashToken(token));
    return null;
  }

  return {
    token,
    userId: row.userId,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
  };
}

export async function destroySession(token: string): Promise<boolean> {
  if (!token) return false;
  return deleteSessionByTokenHash(hashToken(token));
}

export async function rotateSession(token: string): Promise<SessionRecord | null> {
  const current = await loadSession(token);
  if (!current) return null;

  const next = await createSession(current.userId, {
    rotatedFromToken: token,
  });

  await destroySession(token);
  return next;
}

export async function getSessionWithOptionalRotation(token: string): Promise<{
  session: SessionRecord | null;
  rotatedSession?: SessionRecord;
}> {
  const session = await loadSession(token);
  if (!session) return { session: null };

  if (!shouldRotate(session)) {
    return { session };
  }

  const rotated = await rotateSession(token);
  if (!rotated) return { session };

  return {
    session: rotated,
    rotatedSession: rotated,
  };
}
