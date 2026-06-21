import crypto from 'crypto';
import { APPROVAL_STATUS } from '../auth/approval';
import { getConfig } from '../config';
import { loadUserById, updateUserAuthSecurity } from './user.service';
import { badRequest, forbidden } from '../http/api.errors';

type ApprovalTokenPayload = {
  userId: string;
  adminEmail: string;
  action: 'approve' | 'reject';
  nonce: string;
  exp: number;
};

function normalizeEmail(email: string): string {
  return String(email || '').trim().toLowerCase();
}

function escapeHtml(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toBase64Url(value: string): string {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const missing = padded.length % 4;
  const normalized = missing ? `${padded}${'='.repeat(4 - missing)}` : padded;
  return Buffer.from(normalized, 'base64').toString('utf8');
}

function signPayload(encodedPayload: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(encodedPayload)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function safeTimingEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function buildApprovalUrl(token: string): string {
  const config = getConfig();
  const base = config.APPROVAL_LINK_BASE_URL.replace(/\/+$/, '');
  return `${base}/auth/approve?token=${encodeURIComponent(token)}`;
}

function buildRejectUrl(token: string): string {
  const config = getConfig();
  const base = config.APPROVAL_LINK_BASE_URL.replace(/\/+$/, '');
  return `${base}/auth/reject?token=${encodeURIComponent(token)}`;
}

function buildAppHomeUrl(): string {
  const config = getConfig();
  return `${config.WEB_ORIGIN.replace(/\/+$/, '')}/`;
}

const APPROVAL_CONFIRMATION_SENT_KEY = 'approvalConfirmationEmailSentAt';

export type EmailDeliveryResult =
  | { ok: true }
  | { ok: false; skipped?: boolean; error: string };

function isInternalTestEmail(email: string): boolean {
  const normalized = normalizeEmail(email);
  return (
    normalized.endsWith('@financieramente.local') ||
    normalized.endsWith('@financieramente.invalid') ||
    normalized.startsWith('qa-')
  );
}

export function createApprovalToken(input: {
  userId: string;
  adminEmail: string;
  action?: 'approve' | 'reject';
}): string {
  const config = getConfig();
  const action = input.action ?? 'approve';
  const payload: ApprovalTokenPayload = {
    userId: input.userId,
    adminEmail: normalizeEmail(input.adminEmail),
    action,
    nonce: crypto.randomUUID(),
    exp: Date.now() + config.APPROVAL_LINK_TTL_HOURS * 60 * 60 * 1000,
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = signPayload(encodedPayload, config.APPROVAL_LINK_SECRET);
  return `${encodedPayload}.${signature}`;
}

export function verifyApprovalToken(
  token: string,
  expectedAction?: 'approve' | 'reject',
): ApprovalTokenPayload {
  const config = getConfig();
  const [encodedPayload, signature] = String(token || '').split('.');
  if (!encodedPayload || !signature) {
    throw badRequest('Invalid token format');
  }

  const expected = signPayload(encodedPayload, config.APPROVAL_LINK_SECRET);
  const isValid = safeTimingEqual(signature, expected);
  if (!isValid) {
    throw forbidden('Invalid token signature');
  }

  let payload: ApprovalTokenPayload;
  try {
    payload = JSON.parse(fromBase64Url(encodedPayload)) as ApprovalTokenPayload;
  } catch {
    throw badRequest('Invalid token payload encoding');
  }
  if (!payload?.userId || !payload?.adminEmail || !payload?.exp || !payload?.nonce || !payload?.action) {
    throw badRequest('Invalid token payload');
  }
  if (payload.action !== 'approve' && payload.action !== 'reject') {
    throw badRequest('Invalid token action');
  }
  if (expectedAction && payload.action !== expectedAction) {
    throw forbidden('Token action mismatch');
  }
  if (Date.now() > payload.exp) {
    throw forbidden('Token expired');
  }

  if (normalizeEmail(payload.adminEmail) !== normalizeEmail(config.APPROVAL_ADMIN_EMAIL)) {
    throw forbidden('Token admin mismatch');
  }
  return payload;
}

async function sendEmail(params: { to: string; subject: string; html: string }) {
  const config = getConfig();
  if (!config.RESEND_API_KEY) {
    const { getLogger } = await import('../logger');
    getLogger().warn({
      msg: 'Skipping transactional email: RESEND_API_KEY not configured',
      to: params.to,
      subject: params.subject,
    });
    return;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: config.APPROVAL_EMAIL_FROM,
      to: [params.to],
      subject: params.subject,
      html: params.html,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Resend error ${res.status}: ${text}`);
  }
}

/** User-facing notifications must not roll back account state if Resend fails. */
async function sendEmailSafe(params: {
  to: string;
  subject: string;
  html: string;
  context: string;
}): Promise<EmailDeliveryResult> {
  const config = getConfig();
  const { getLogger } = await import('../logger');
  const logger = getLogger();

  if (!config.RESEND_API_KEY?.trim()) {
    logger.warn({
      msg: 'Skipping transactional email: RESEND_API_KEY not configured',
      context: params.context,
      to: params.to,
      subject: params.subject,
    });
    return { ok: false, skipped: true, error: 'RESEND_API_KEY not configured' };
  }

  try {
    await sendEmail(params);
    logger.info({
      msg: 'Transactional email sent',
      context: params.context,
      to: params.to,
      subject: params.subject,
    });
    return { ok: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({
      msg: 'Transactional email failed',
      context: params.context,
      to: params.to,
      subject: params.subject,
      error,
    });
    return { ok: false, error: message };
  }
}

export async function sendApprovalRequestEmail(params: {
  userId: string;
  userName: string;
  userEmail: string;
}) {
  const config = getConfig();
  const approveToken = createApprovalToken({
    userId: params.userId,
    adminEmail: config.APPROVAL_ADMIN_EMAIL,
    action: 'approve',
  });
  const rejectToken = createApprovalToken({
    userId: params.userId,
    adminEmail: config.APPROVAL_ADMIN_EMAIL,
    action: 'reject',
  });
  const approveUrl = buildApprovalUrl(approveToken);
  const rejectUrl = buildRejectUrl(rejectToken);

  await sendEmail({
    to: config.APPROVAL_ADMIN_EMAIL,
    subject: `Aprobacion pendiente: ${params.userName}`,
    html: `
      <h2>Nueva cuenta pendiente de aprobación</h2>
      <p><strong>Nombre:</strong> ${escapeHtml(params.userName)}</p>
      <p><strong>Email:</strong> ${escapeHtml(params.userEmail)}</p>
      <p><strong>ID:</strong> ${escapeHtml(params.userId)}</p>
      <p><a href="${approveUrl}">Autorizar cuenta (1 clic)</a></p>
      <p><a href="${rejectUrl}">Rechazar cuenta</a></p>
      <p>Este enlace expira en ${config.APPROVAL_LINK_TTL_HOURS} horas.</p>
    `,
  });
}

export async function sendApprovedNotificationEmail(params: {
  userEmail: string;
  userName: string;
}): Promise<EmailDeliveryResult> {
  const loginUrl = buildAppHomeUrl();
  return sendEmailSafe({
    to: params.userEmail,
    subject: 'Tu cuenta fue aprobada',
    html: `
      <h2>Tu cuenta ya está activa</h2>
      <p>Hola ${escapeHtml(params.userName)}, tu cuenta en Financieramente fue aprobada.</p>
      <p>Ya puedes iniciar sesión y continuar con tu diagnóstico.</p>
      <p><a href="${escapeHtml(loginUrl)}">Iniciar sesión</a></p>
    `,
    context: 'account-approved',
  });
}

export async function sendRejectedNotificationEmail(params: {
  userEmail: string;
  userName: string;
}): Promise<EmailDeliveryResult> {
  return sendEmailSafe({
    to: params.userEmail,
    subject: 'Estado de tu solicitud',
    html: `
      <h2>Actualización de tu solicitud</h2>
      <p>Hola ${escapeHtml(params.userName)}, por ahora no pudimos aprobar tu cuenta.</p>
      <p>Si crees que fue un error, responde este correo para revisarlo.</p>
    `,
    context: 'account-rejected',
  });
}

// ─── Password Reset ──────────────────────────────────────────────────────────

type PasswordResetPayload = {
  userId: string;
  userEmail: string;
  nonce: string;
  exp: number;
  version: number;
};

const RESET_TTL_HOURS = 1;

export function createPasswordResetToken(input: { userId: string; userEmail: string; version: number }): string {
  const config = getConfig();
  const payload: PasswordResetPayload = {
    userId: input.userId,
    userEmail: normalizeEmail(input.userEmail),
    nonce: crypto.randomUUID(),
    exp: Date.now() + RESET_TTL_HOURS * 60 * 60 * 1000,
    version: Number.isFinite(input.version) && input.version >= 0 ? Math.floor(input.version) : 0,
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = signPayload(encodedPayload, config.PASSWORD_RESET_LINK_SECRET);
  return `${encodedPayload}.${signature}`;
}

export function verifyPasswordResetToken(token: string): PasswordResetPayload {
  const config = getConfig();
  const [encodedPayload, signature] = String(token || '').split('.');
  if (!encodedPayload || !signature) {
    throw badRequest('Token inválido');
  }
  const expected = signPayload(encodedPayload, config.PASSWORD_RESET_LINK_SECRET);
  if (!safeTimingEqual(signature, expected)) {
    throw badRequest('Token inválido o expirado');
  }
  let payload: PasswordResetPayload;
  try {
    payload = JSON.parse(fromBase64Url(encodedPayload)) as PasswordResetPayload;
  } catch {
    throw badRequest('Token inválido');
  }
  if (!payload?.userId || !payload?.userEmail || !payload?.exp || !payload?.nonce) {
    throw badRequest('Token inválido');
  }
  if (!Number.isInteger(payload.version) || payload.version < 0) {
    throw badRequest('Token inválido');
  }
  if (Date.now() > payload.exp) {
    throw badRequest('El enlace de recuperación expiró. Solicita uno nuevo.');
  }
  return payload;
}

export async function sendPasswordResetEmail(params: {
  userName: string;
  userEmail: string;
  token: string;
}) {
  const config = getConfig();
  const base = config.APPROVAL_LINK_BASE_URL.replace(/\/+$/, '');
  const resetUrl = `${base}/reset-password?token=${encodeURIComponent(params.token)}`;

  await sendEmail({
    to: params.userEmail,
    subject: 'Recupera tu contraseña — Financieramente',
    html: `
      <h2>Recuperación de contraseña</h2>
      <p>Hola ${escapeHtml(params.userName)},</p>
      <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta.</p>
      <p><a href="${resetUrl}">Restablecer contraseña (válido por ${RESET_TTL_HOURS} hora)</a></p>
      <p>Si no solicitaste esto, ignora este mensaje. Tu contraseña no cambiará.</p>
    `,
  });
}

// ─── Approval ────────────────────────────────────────────────────────────────

export async function approveUserFromSignedToken(token: string) {
  const payload = verifyApprovalToken(token, 'approve');
  return approveUserByAdmin({
    userId: payload.userId,
    adminEmail: payload.adminEmail,
  });
}

export async function rejectUserFromSignedToken(token: string) {
  const payload = verifyApprovalToken(token, 'reject');
  return rejectUserByAdmin({
    userId: payload.userId,
    adminEmail: payload.adminEmail,
  });
}

export async function approveUserByAdmin(params: {
  userId: string;
  adminEmail: string;
}) {
  const user = await loadUserById(params.userId);
  if (!user) {
    throw badRequest('User not found');
  }

  if (user.approvalStatus === APPROVAL_STATUS.APPROVED) {
    return { alreadyApproved: true, user };
  }

  const updated = await updateUserAuthSecurity(user.id, {
    approvalStatus: APPROVAL_STATUS.APPROVED,
    approvedAt: new Date().toISOString(),
    approvedByEmail: normalizeEmail(params.adminEmail),
  });
  if (!updated) {
    throw badRequest('Failed to approve user');
  }

  const emailResult = await sendApprovedNotificationEmail({
    userEmail: updated.email,
    userName: updated.name,
  });

  if (emailResult.ok) {
    const withFlag = await updateUserAuthSecurity(updated.id, {
      memoryBlob: {
        ...(updated.memoryBlob ?? {}),
        [APPROVAL_CONFIRMATION_SENT_KEY]: new Date().toISOString(),
      },
    });
    return { alreadyApproved: false, user: withFlag ?? updated };
  }

  return { alreadyApproved: false, user: updated };
}

export async function rejectUserByAdmin(params: {
  userId: string;
  adminEmail: string;
}) {
  const user = await loadUserById(params.userId);
  if (!user) {
    throw badRequest('User not found');
  }

  if (user.approvalStatus === APPROVAL_STATUS.REJECTED) {
    return { alreadyRejected: true, user };
  }

  const updated = await updateUserAuthSecurity(user.id, {
    approvalStatus: APPROVAL_STATUS.REJECTED,
    approvedAt: new Date().toISOString(),
    approvedByEmail: normalizeEmail(params.adminEmail),
  });
  if (!updated) {
    throw badRequest('Failed to reject user');
  }

  await sendRejectedNotificationEmail({
    userEmail: updated.email,
    userName: updated.name,
  });

  return { alreadyRejected: false, user: updated };
}

export type ApprovalConfirmationBackfillReport = {
  scanned: number;
  sent: number;
  skippedAlreadySent: number;
  skippedInternal: number;
  failed: number;
  failures: Array<{ userId: string; email: string; error: string }>;
};

export async function resendPendingApprovalConfirmationEmails(): Promise<ApprovalConfirmationBackfillReport> {
  const { getPrismaClient } = await import('../persistencia/provider');
  const { USER_ROLES } = await import('../auth/rbac');
  const prisma = await getPrismaClient();
  const rows = await prisma.user.findMany({
    where: {
      approvalStatus: APPROVAL_STATUS.APPROVED,
      role: USER_ROLES.USER,
    },
    select: {
      id: true,
      name: true,
      email: true,
      memoryBlob: true,
    },
  });

  const report: ApprovalConfirmationBackfillReport = {
    scanned: rows.length,
    sent: 0,
    skippedAlreadySent: 0,
    skippedInternal: 0,
    failed: 0,
    failures: [],
  };

  for (const row of rows) {
    if (isInternalTestEmail(row.email)) {
      report.skippedInternal += 1;
      continue;
    }

    const blob = (row.memoryBlob ?? null) as Record<string, unknown> | null;
    if (typeof blob?.[APPROVAL_CONFIRMATION_SENT_KEY] === 'string') {
      report.skippedAlreadySent += 1;
      continue;
    }

    const result = await sendApprovedNotificationEmail({
      userEmail: row.email,
      userName: row.name,
    });

    if (result.ok) {
      report.sent += 1;
      await prisma.user.update({
        where: { id: row.id },
        data: {
          memoryBlob: {
            ...(blob ?? {}),
            [APPROVAL_CONFIRMATION_SENT_KEY]: new Date().toISOString(),
          },
        },
      });
      continue;
    }

    report.failed += 1;
    report.failures.push({
      userId: row.id,
      email: row.email,
      error: result.error ?? 'Unknown error',
    });
  }

  return report;
}
