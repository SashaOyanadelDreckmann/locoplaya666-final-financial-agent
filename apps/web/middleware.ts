import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { hasValidBackendSession, resolveServerBackendBase } from '@/lib/sessionAccess';

const PROTECTED_PATHS = ['/agent', '/interview', '/diagnosis', '/intake', '/analytics', '/admin', '/budgetpreview'];
const GUEST_ONLY_PATHS = ['/login', '/register'];
const APPROVAL_WAITING_PATH = '/waiting-approval';
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME?.trim()
  || process.env.NEXT_PUBLIC_SESSION_COOKIE_NAME?.trim()
  || 'session';

function hasSessionCookie(request: NextRequest): boolean {
  return Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value?.trim());
}

async function sessionIsValid(request: NextRequest): Promise<boolean> {
  const cookieHeader = request.headers.get('cookie')?.trim();
  if (!cookieHeader) return false;

  const backendBase = resolveServerBackendBase({
    requestOrigin: request.nextUrl.origin,
    forwardedHost: request.headers.get('x-forwarded-host'),
    forwardedProto: request.headers.get('x-forwarded-proto'),
  });

  return hasValidBackendSession({ cookieHeader, backendBase });
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

    const valid = await sessionIsValid(request);
    if (!valid) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('next', pathname);
      const response = NextResponse.redirect(url);
      response.cookies.delete(SESSION_COOKIE_NAME);
      return response;
    }
  }

  if (isGuestOnly && hasSessionCookieValue) {
    const valid = await sessionIsValid(request);
    if (valid) {
      const url = request.nextUrl.clone();
      url.pathname = '/agent';
      return NextResponse.redirect(url);
    }
  }

  if (isApprovalWaiting && hasSessionCookieValue) {
    const valid = await sessionIsValid(request);
    if (valid) {
      const url = request.nextUrl.clone();
      url.pathname = '/agent';
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/agent/:path*',
    '/interview/:path*',
    '/diagnosis/:path*',
    '/intake/:path*',
    '/analytics/:path*',
    '/admin/:path*',
    '/budgetpreview/:path*',
    '/login',
    '/register',
    '/waiting-approval',
  ],
};
