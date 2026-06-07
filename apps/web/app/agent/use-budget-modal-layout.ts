import { useEffect, useState, useSyncExternalStore } from 'react';
import type { CSSProperties } from 'react';

import { shouldUseMobileShell } from '@/lib/viewport-mode';

function subscribeViewportMode(onStoreChange: () => void) {
  window.addEventListener('resize', onStoreChange);
  window.addEventListener('orientationchange', onStoreChange);
  return () => {
    window.removeEventListener('resize', onStoreChange);
    window.removeEventListener('orientationchange', onStoreChange);
  };
}

function getMobileShellSnapshot() {
  return shouldUseMobileShell();
}

function getMobileShellServerSnapshot() {
  return false;
}

export function useBudgetModalLayout(isOpen: boolean) {
  const mobileShell = useSyncExternalStore(
    subscribeViewportMode,
    getMobileShellSnapshot,
    getMobileShellServerSnapshot,
  );
  const isDesktopLayout = !mobileShell;
  const [budgetViewMode, setBudgetViewMode] = useState<1 | 2 | 3>(1);

  useEffect(() => {
    if (!isOpen) return;
    setBudgetViewMode(mobileShell ? 1 : 2);
  }, [isOpen, mobileShell]);

  function moveBudgetView(direction: 'next' | 'prev') {
    const maxMode = isDesktopLayout ? 3 : 2;
    setBudgetViewMode((prev) => {
      if (direction === 'next') return (prev >= maxMode ? 1 : prev + 1) as 1 | 2 | 3;
      return (prev <= 1 ? maxMode : prev - 1) as 1 | 2 | 3;
    });
  }

  function cardStyle(card: 'agent' | 'table'): CSSProperties {
    if (!isDesktopLayout) return {};
    if (budgetViewMode === 3) {
      return card === 'agent' ? { display: 'none' } : {};
    }
    return {};
  }

  const budgetModeClass = isDesktopLayout
    ? budgetViewMode === 3
      ? 'table-only'
      : budgetViewMode === 2
        ? 'split'
        : 'agent-front'
    : budgetViewMode === 2
      ? 'table-front'
      : 'agent-front';

  return { isDesktopLayout, budgetViewMode, setBudgetViewMode, moveBudgetView, cardStyle, budgetModeClass };
}
