import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { resolveServerBackendBase, validateBackendSession } from '@/lib/sessionAccess';

const PROTECTED_PATHS = ['/agent', '/interview', '/diagnosis', '/intake', '/analytics', '/admin'];
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
      const url = request.nextUrl.clone();
      url.pathname = '/agent';
      return NextResponse.redirect(url);
    }
  }

  if (isApprovalWaiting && hasSessionCookieValue) {
    const session = await sessionIsValid(request);
    if (session.valid) {
      const url = request.nextUrl.clone();
      url.pathname = '/agent';
      return NextResponse.redirect(url);
    }
  }

  return nextWithPathname(request);
}

export const config = {
  matcher: [
    '/agent/:path*',
    '/interview/:path*',
    '/diagnosis/:path*',
    '/intake/:path*',
    '/analytics/:path*',
    '/admin/:path*',
    '/login',
    '/register',
    '/waiting-approval',
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)',
  ],
};
