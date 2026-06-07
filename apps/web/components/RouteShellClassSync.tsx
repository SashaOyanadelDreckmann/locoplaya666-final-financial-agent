'use client';

import { useLayoutEffect } from 'react';
import { usePathname } from 'next/navigation';

import { syncRouteShellClasses } from '@/lib/route-shell-classes';

/** Keeps html/body route shell classes aligned during client-side navigations. */
export default function RouteShellClassSync() {
  const pathname = usePathname();

  useLayoutEffect(() => {
    syncRouteShellClasses(pathname ?? '');
  }, [pathname]);

  return null;
}
