import crypto from 'crypto';
import { APPROVAL_STATUS } from '../auth/approval';
import { getConfig } from '../config';
import { loadUserById, updateUserAuthSecurity } from './user.service';
import { badRequest, forbidden } from '../http/api.errors';

type ApprovalTokenPayload = {
  userId: string;
  adminEmail: string;
  exp: number;
};

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

export function createApprovalToken(input: { userId: string; adminEmail: string }): string {
  const config = getConfig();
  const payload: ApprovalTokenPayload = {
    userId: input.userId,
    adminEmail: input.adminEmail.trim().toLowerCase(),
    exp: Date.now() + config.APPROVAL_LINK_TTL_HOURS * 60 * 60 * 1000,
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = signPayload(encodedPayload, config.APPROVAL_LINK_SECRET);
  return `${encodedPayload}.${signature}`;
}

export function verifyApprovalToken(token: string): ApprovalTokenPayload {
  const config = getConfig();
  const [encodedPayload, signature] = String(token || '').split('.');
  if (!encodedPayload || !signature) {
    throw new Error('Invalid token format');
  }

  const expected = signPayload(encodedPayload, config.APPROVAL_LINK_SECRET);
  const isValid = safeTimingEqual(signature, expected);
  if (!isValid) {
    throw forbidden('Invalid token signature');
  }

  const payload = JSON.parse(fromBase64Url(encodedPayload)) as ApprovalTokenPayload;
  if (!payload?.userId || !payload?.adminEmail || !payload?.exp) {
    throw badRequest('Invalid token payload');
  }
  if (Date.now() > payload.exp) {
    throw forbidden('Token expired');
  }

  if (payload.adminEmail !== config.APPROVAL_ADMIN_EMAIL.trim().toLowerCase()) {
    throw forbidden('Token admin mismatch');
  }
  return payload;
}

async function sendEmail(params: { to: string; subject: string; html: string }) {
  const config = getConfig();
  if (!config.RESEND_API_KEY) {
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

export async function sendApprovalRequestEmail(params: {
  userId: string;
  userName: string;
  userEmail: string;
}) {
  const config = getConfig();
  const token = createApprovalToken({
    userId: params.userId,
    adminEmail: config.APPROVAL_ADMIN_EMAIL,
  });
  const url = buildApprovalUrl(token);

  await sendEmail({
    to: config.APPROVAL_ADMIN_EMAIL,
    subject: `Aprobación pendiente: ${params.userName}`,
    html: `
      <h2>Nueva cuenta pendiente de aprobación</h2>
      <p><strong>Nombre:</strong> ${params.userName}</p>
      <p><strong>Email:</strong> ${params.userEmail}</p>
      <p><strong>ID:</strong> ${params.userId}</p>
      <p><a href="${url}">Autorizar cuenta (1 clic)</a></p>
      <p>Este enlace expira en ${config.APPROVAL_LINK_TTL_HOURS} horas.</p>
    `,
  });
}

export async function sendApprovedNotificationEmail(params: {
  userEmail: string;
  userName: string;
}) {
  await sendEmail({
    to: params.userEmail,
    subject: 'Tu cuenta fue aprobada',
    html: `
      <h2>Tu cuenta ya está activa</h2>
      <p>Hola ${params.userName}, tu cuenta en Financieramente fue aprobada.</p>
      <p>Ya puedes iniciar sesión y continuar con tu diagnóstico.</p>
    `,
  });
}

export async function approveUserFromSignedToken(token: string) {
  const payload = verifyApprovalToken(token);
  const user = await loadUserById(payload.userId);
  if (!user) {
    throw new Error('User not found');
  }

  if (user.approvalStatus === APPROVAL_STATUS.APPROVED) {
    return { alreadyApproved: true, user };
  }

  const updated = await updateUserAuthSecurity(user.id, {
    approvalStatus: APPROVAL_STATUS.APPROVED,
    approvedAt: new Date().toISOString(),
    approvedByEmail: payload.adminEmail,
  });
  if (!updated) {
    throw new Error('Failed to approve user');
  }

  await sendApprovedNotificationEmail({
    userEmail: updated.email,
    userName: updated.name,
  });

  return { alreadyApproved: false, user: updated };
}
