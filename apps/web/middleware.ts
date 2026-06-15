import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { resolveLoginFallbackRoute } from '@/lib/sesion/auth-redirect';
import {
  fetchServerSession,
  resolveServerBackendBase,
  type ServerSessionInfo,
  validateBackendSession,
} from '@/lib/sesion/sessionAccess';

const PROTECTED_PATHS = ['/agent', '/interview', '/intake', '/analytics', '/admin'];
const GUEST_ONLY_PATHS = ['/login', '/register'];
const APPROVAL_WAITING_PATH = '/waiting-approval';
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME?.trim()
  || process.env.NEXT_PUBLIC_SESSION_COOKIE_NAME?.trim()
  || 'session';

const PATHNAME_HEADER = 'x-pathname';

function nextWithPathname(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(PATHNAME_HEADER, request.nextUrl.pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

function hasSessionCookie(request: NextRequest): boolean {
  return Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value?.trim());
}

function applyRedirectTarget(url: URL, target: string) {
  const parsed = new URL(target, url.origin);
  url.pathname = parsed.pathname;
  url.search = parsed.search;
}

function redirectAuthenticatedLanding(request: NextRequest, profile: ServerSessionInfo) {
  const url = request.nextUrl.clone();
  applyRedirectTarget(
    url,
    resolveLoginFallbackRoute({
      role: profile.role,
      session: profile,
    }),
  );
  return NextResponse.redirect(url);
}

async function sessionIsValid(request: NextRequest): Promise<{
  valid: boolean;
  clearCookie: boolean;
}> {
  const cookieHeader = request.headers.get('cookie')?.trim();
  if (!cookieHeader) return { valid: false, clearCookie: false };

  const backendBase = resolveServerBackendBase({
    requestOrigin: request.nextUrl.origin,
    forwardedHost: request.headers.get('x-forwarded-host'),
    forwardedProto: request.headers.get('x-forwarded-proto'),
  });

  return validateBackendSession({ cookieHeader, backendBase });
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSessionCookieValue = hasSessionCookie(request);

  const isProtected = PROTECTED_PATHS.some(
    (base) => pathname === base || pathname.startsWith(`${base}/`),
  );
  const isGuestOnly = GUEST_ONLY_PATHS.some(
    (base) => pathname === base || pathname.startsWith(`${base}/`),
  );
  const isApprovalWaiting = pathname === APPROVAL_WAITING_PATH || pathname.startsWith(`${APPROVAL_WAITING_PATH}/`);

  if (isProtected) {
    if (!hasSessionCookieValue) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
    }

    const session = await sessionIsValid(request);
    if (!session.valid) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('next', pathname);
      const response = NextResponse.redirect(url);
      if (session.clearCookie) {
        response.cookies.delete(SESSION_COOKIE_NAME);
      }
      return response;
    }
  }

  if (isGuestOnly && hasSessionCookieValue) {
    const session = await sessionIsValid(request);
    if (session.valid) {
      const cookieHeader = request.headers.get('cookie')?.trim() ?? '';
      const backendBase = resolveServerBackendBase({
        requestOrigin: request.nextUrl.origin,
        forwardedHost: request.headers.get('x-forwarded-host'),
        forwardedProto: request.headers.get('x-forwarded-proto'),
      });
      const { session: profile } = await fetchServerSession({ cookieHeader, backendBase });
      if (profile?.id) {
        return redirectAuthenticatedLanding(request, profile);
      }
    }
  }

  if (isApprovalWaiting && hasSessionCookieValue) {
    const session = await sessionIsValid(request);
    if (session.valid) {
      const cookieHeader = request.headers.get('cookie')?.trim() ?? '';
      const backendBase = resolveServerBackendBase({
        requestOrigin: request.nextUrl.origin,
        forwardedHost: request.headers.get('x-forwarded-host'),
        forwardedProto: request.headers.get('x-forwarded-proto'),
      });
      const { session: profile } = await fetchServerSession({ cookieHeader, backendBase });
      if (profile?.id) {
        return redirectAuthenticatedLanding(request, profile);
      }
    }
  }

  return nextWithPathname(request);
}

export const config = {
  matcher: [
    '/agent/:path*',
    '/interview/:path*',
    '/intake/:path*',
    '/analytics/:path*',
    '/admin',
    '/admin/:path*',
    '/login',
    '/register',
    '/waiting-approval',
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)',
  ],
};
