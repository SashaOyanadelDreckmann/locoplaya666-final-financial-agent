/**
 * Server-side auth helper for Next.js API routes.
 * Validates the session cookie against the backend before allowing access.
 */
import { getApiBaseUrl } from './apiBase';
import { parseApiResponse } from './apiEnvelope';

export async function requireBackendSession(request: Request) {
  const cookie = request.headers.get('cookie');
  if (!cookie) throw new Error('UNAUTHENTICATED');

  const res = await fetch(`${getApiBaseUrl()}/auth/me`, {
    method: 'GET',
    cache: 'no-store',
    headers: { cookie },
  });

  if (!res.ok) throw new Error('UNAUTHENTICATED');

  const session = await parseApiResponse<{ userId?: string }>(res);
  if (!session?.userId) throw new Error('UNAUTHENTICATED');

  return session as { userId: string };
}
