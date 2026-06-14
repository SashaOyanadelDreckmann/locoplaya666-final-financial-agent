import {
  resolveRouteShellClass,
  ROUTE_SHELL_CLASS_NAMES,
  syncRouteShellClasses,
} from '../interfaz/route-shell-classes';

describe('resolveRouteShellClass', () => {
  it('maps known routes to shell classes', () => {
    expect(resolveRouteShellClass('/')).toBe('home-route-active');
    expect(resolveRouteShellClass('/agent')).toBe('agent-route-active');
    expect(resolveRouteShellClass('/agent/chat')).toBe('agent-route-active');
    expect(resolveRouteShellClass('/intake')).toBe('intake-route-active');
    expect(resolveRouteShellClass('/intake/step-2')).toBe('intake-route-active');
    expect(resolveRouteShellClass('/login')).toBe('auth-route-active');
    expect(resolveRouteShellClass('/register')).toBe('auth-route-active');
    expect(resolveRouteShellClass('/forgot-password')).toBe('auth-route-active');
    expect(resolveRouteShellClass('/waiting-approval')).toBe('auth-route-active');
  });

  it('returns undefined for routes without a shell class', () => {
    expect(resolveRouteShellClass('/reset-password')).toBeUndefined();
    expect(resolveRouteShellClass('/analytics')).toBeUndefined();
  });
});

describe('syncRouteShellClasses', () => {
  beforeEach(() => {
    document.documentElement.className = '';
    document.body.className = '';
  });

  it('applies only the active route class on html and body', () => {
    syncRouteShellClasses('/agent');

    expect(document.documentElement.classList.contains('agent-route-active')).toBe(true);
    expect(document.body.classList.contains('agent-route-active')).toBe(true);
    for (const className of ROUTE_SHELL_CLASS_NAMES) {
      if (className === 'agent-route-active') continue;
      expect(document.documentElement.classList.contains(className)).toBe(false);
      expect(document.body.classList.contains(className)).toBe(false);
    }
  });

  it('clears route classes when navigating to an unclassified route', () => {
    syncRouteShellClasses('/');
    syncRouteShellClasses('/analytics');

    for (const className of ROUTE_SHELL_CLASS_NAMES) {
      expect(document.documentElement.classList.contains(className)).toBe(false);
      expect(document.body.classList.contains(className)).toBe(false);
    }
  });
});
