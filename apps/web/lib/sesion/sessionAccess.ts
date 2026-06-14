import { ApiHttpError } from '@/lib/api/envelope';
import { readApiOriginFromProcessEnv } from '@/lib/compartido/runtimePublicConfig';

export function hasCompletedIntakeAccess(
  injectedIntake: { intake?: unknown } | null | undefined,
): boolean {
  if (hasMeaningfulIntake(injectedIntake)) return true;
  const intake = injectedIntake?.intake;
  if (!intake || typeof intake !== 'object') return false;
  const data = intake as Record<string, unknown>;
  return (
    typeof data.employmentStatus === 'string' &&
    data.employmentStatus.length > 0 &&
    typeof data.incomeBand === 'string' &&
    data.incomeBand.length > 0
  );
}

export function hasMeaningfulIntake(
  injectedIntake: { intake?: unknown } | null | undefined,
): boolean {
  const intake = injectedIntake?.intake;
  if (!intake || typeof intake !== 'object') return false;

  const data = intake as Record<string, unknown>;
  const knowledge = data.financialKnowledge;
  const hasKnowledge =
    knowledge !== null &&
    typeof knowledge === 'object' &&
    !Array.isArray(knowledge);

  return (
    typeof data.employmentStatus === 'string' &&
    data.employmentStatus.length > 0 &&
    typeof data.incomeBand === 'string' &&
    data.incomeBand.length > 0 &&
    typeof data.expensesCoverage === 'string' &&
    typeof data.tracksExpenses === 'string' &&
    typeof data.hasSavingsOrInvestments === 'boolean' &&
    typeof data.hasDebt === 'boolean' &&
    typeof data.riskReaction === 'string' &&
    typeof data.selfRatedUnderstanding === 'number' &&
    Number.isFinite(data.selfRatedUnderstanding) &&
    typeof data.moneyStressLevel === 'number' &&
    Number.isFinite(data.moneyStressLevel) &&
    hasKnowledge
  );
}

export function resolveAuthRedirectPath(error: unknown): '/login' | '/waiting-approval' {
  if (error instanceof ApiHttpError) {
    const code = String(error.code ?? '').toUpperCase();
    if (error.status === 403 && (code === 'ACCOUNT_PENDING_APPROVAL' || code === 'ACCOUNT_REJECTED')) {
      return '/waiting-approval';
    }
  }
  return '/login';
}

export type ServerSessionInfo = {
  id?: string;
  injectedIntake?: { intake?: unknown } | null;
};

function parseSessionEnvelope(raw: unknown): ServerSessionInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const envelope = raw as Record<string, unknown>;
  if (envelope.ok === true && envelope.data && typeof envelope.data === 'object') {
    return envelope.data as ServerSessionInfo;
  }
  if (typeof envelope.id === 'string') {
    return envelope as ServerSessionInfo;
  }
  return null;
}

export function resolveServerBackendBase(params: {
  requestOrigin?: string | null;
  forwardedHost?: string | null;
  forwardedProto?: string | null;
}): string {
  const direct = readApiOriginFromProcessEnv();
  if (direct) return direct;

  const host = params.forwardedHost?.trim();
  const proto = (params.forwardedProto ?? 'https').split(',')[0]?.trim() || 'https';
  if (host) return `${proto}://${host}/backend`;

  const origin = params.requestOrigin?.trim().replace(/\/+$/, '');
  if (origin) return `${origin}/backend`;

  return 'http://localhost:3001';
}

export async function fetchServerSession(params: {
  cookieHeader: string;
  backendBase: string;
}): Promise<{ session: ServerSessionInfo | null; status: number }> {
  const base = params.backendBase.replace(/\/+$/, '');
  try {
    const res = await fetch(`${base}/api/session`, {
      method: 'GET',
      cache: 'no-store',
      headers: { cookie: params.cookieHeader },
    });
    if (!res.ok) {
      return { session: null, status: res.status };
    }
    const raw = await res.json().catch(() => null);
    const session = parseSessionEnvelope(raw);
    if (!session?.id) return { session: null, status: 401 };
    return { session, status: 200 };
  } catch {
    return { session: null, status: 503 };
  }
}

export type BackendSessionValidation = {
  valid: boolean;
  clearCookie: boolean;
};

export async function validateBackendSession(params: {
  cookieHeader: string;
  backendBase: string;
}): Promise<BackendSessionValidation> {
  const base = params.backendBase.replace(/\/+$/, '');
  try {
    const res = await fetch(`${base}/auth/me`, {
      method: 'GET',
      cache: 'no-store',
      headers: { cookie: params.cookieHeader },
    });
    if (res.status === 401 || res.status === 403) {
      return { valid: false, clearCookie: true };
    }
    if (!res.ok) {
      return { valid: false, clearCookie: false };
    }
    const raw = await res.json().catch(() => null);
    const envelope = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
    const userId =
      envelope?.ok === true
        ? String((envelope.data as Record<string, unknown> | undefined)?.userId ?? '').trim()
        : '';
    return { valid: Boolean(userId), clearCookie: !userId };
  } catch {
    return { valid: false, clearCookie: false };
  }
}

export async function hasValidBackendSession(params: {
  cookieHeader: string;
  backendBase: string;
}): Promise<boolean> {
  const result = await validateBackendSession(params);
  return result.valid;
}
