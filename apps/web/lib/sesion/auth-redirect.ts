import { getSessionInfo } from '../api/cliente';
import { hasCompletedIntakeAccess } from './sessionAccess';

const SESSION_READY_RETRIES = 8;
const SESSION_READY_DELAY_MS = 125;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForSessionReady() {
  for (let attempt = 0; attempt < SESSION_READY_RETRIES; attempt += 1) {
    const session = await getSessionInfo().catch(() => null);
    if (session?.id) return session;
    if (attempt < SESSION_READY_RETRIES - 1) {
      await sleep(SESSION_READY_DELAY_MS * (attempt + 1));
    }
  }
  return null;
}

export function resolveLoginFallbackRoute(params: {
  role?: string | null;
  session?: { injectedIntake?: { intake?: unknown } | null } | null;
}): string {
  const role = String(params.role ?? '').toUpperCase();
  if (role === 'ADMIN') return '/admin';
  if (params.session && !hasCompletedIntakeAccess(params.session.injectedIntake)) {
    return '/intake?status=approved';
  }
  return '/agent';
}
