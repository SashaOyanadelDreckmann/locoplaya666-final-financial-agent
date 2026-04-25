import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const PROTECTED_PATHS = ['/agent', '/interview', '/diagnosis', '/intake'];
const GUEST_ONLY_PATHS = ['/login', '/register'];
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME?.trim()
  || process.env.NEXT_PUBLIC_SESSION_COOKIE_NAME?.trim()
  || 'session';

function hasSessionCookie(request: NextRequest): boolean {
  return Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = hasSessionCookie(request);

  const isProtected = PROTECTED_PATHS.some(
    (base) => pathname === base || pathname.startsWith(`${base}/`),
  );
  const isGuestOnly = GUEST_ONLY_PATHS.some(
    (base) => pathname === base || pathname.startsWith(`${base}/`),
  );

  if (isProtected && !hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (isGuestOnly && hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = '/agent';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/agent/:path*', '/interview/:path*', '/diagnosis/:path*', '/intake/:path*', '/login', '/register'],
};
