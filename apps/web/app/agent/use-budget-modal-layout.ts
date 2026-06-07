import { useEffect, useState, useSyncExternalStore } from 'react';
import type { CSSProperties } from 'react';

import { shouldUseMobileShell } from '@/lib/viewport-mode';

export type BudgetViewMode = 1 | 2 | 3;

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

export function getBudgetTableViewMode(isDesktopLayout: boolean): BudgetViewMode {
  return isDesktopLayout ? 3 : 2;
}

export function resolveBudgetModeClass(isDesktopLayout: boolean, budgetViewMode: BudgetViewMode): string {
  if (isDesktopLayout) {
    if (budgetViewMode === 1) return 'split';
    if (budgetViewMode === 2) return 'agent-front';
    return 'table-only';
  }
  return budgetViewMode === 2 ? 'table-front' : 'agent-front';
}

export function resolveBudgetViewDataAttr(isDesktopLayout: boolean, budgetViewMode: BudgetViewMode): string {
  if (isDesktopLayout) {
    if (budgetViewMode === 1) return 'split';
    if (budgetViewMode === 2) return 'assistant';
    return 'table';
  }
  return budgetViewMode === 2 ? 'table' : 'assistant';
}

export function useBudgetModalLayout(isOpen: boolean) {
  const mobileShell = useSyncExternalStore(
    subscribeViewportMode,
    getMobileShellSnapshot,
    getMobileShellServerSnapshot,
  );
  const isDesktopLayout = !mobileShell;
  const [budgetViewMode, setBudgetViewMode] = useState<BudgetViewMode>(1);

  useEffect(() => {
    if (!isOpen) return;
    setBudgetViewMode(1);
  }, [isOpen, mobileShell]);

  function moveBudgetView(direction: 'next' | 'prev') {
    setBudgetViewMode((prev) => {
      const maxMode: BudgetViewMode = isDesktopLayout ? 3 : 2;
      if (direction === 'next') {
        return prev >= maxMode ? 1 : ((prev + 1) as BudgetViewMode);
      }
      return prev <= 1 ? maxMode : ((prev - 1) as BudgetViewMode);
    });
  }

  function cardStyle(card: 'agent' | 'table'): CSSProperties {
    if (!isDesktopLayout) return {};
    if (budgetViewMode === 3 && card === 'agent') {
      return { display: 'none' };
    }
    return {};
  }

  const budgetModeClass = resolveBudgetModeClass(isDesktopLayout, budgetViewMode);

  return {
    isDesktopLayout,
    budgetViewMode,
    setBudgetViewMode,
    moveBudgetView,
    cardStyle,
    budgetModeClass,
    tableViewMode: getBudgetTableViewMode(isDesktopLayout),
  };
}
