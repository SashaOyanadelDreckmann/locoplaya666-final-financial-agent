export const ROUTE_SHELL_CLASS_NAMES = [
  'home-route-active',
  'agent-route-active',
  'intake-route-active',
  'auth-route-active',
] as const;

export type RouteShellClassName = (typeof ROUTE_SHELL_CLASS_NAMES)[number];

/** Route shell class used by global CSS on html/body. */
export function resolveRouteShellClass(pathname: string): RouteShellClassName | undefined {
  if (pathname === '/') return 'home-route-active';
  if (/^\/agent(\/|$)/.test(pathname)) return 'agent-route-active';
  if (/^\/intake(\/|$)/.test(pathname)) return 'intake-route-active';
  if (/^\/(login|register|forgot-password|waiting-approval)(\/|$)/.test(pathname)) {
    return 'auth-route-active';
  }
  return undefined;
}

export function syncRouteShellClasses(
  pathname: string,
  root: HTMLElement = document.documentElement,
): void {
  const activeClass = resolveRouteShellClass(pathname);
  const body = document.body;

  for (const className of ROUTE_SHELL_CLASS_NAMES) {
    const on = className === activeClass;
    root.classList.toggle(className, on);
    body?.classList.toggle(className, on);
  }
}
