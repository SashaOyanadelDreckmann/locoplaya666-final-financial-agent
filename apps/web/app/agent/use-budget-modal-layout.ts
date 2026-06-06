import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';

export function useBudgetModalLayout(isOpen: boolean) {
  const [isDesktopLayout, setIsDesktopLayout] = useState(false);
  const [budgetViewMode, setBudgetViewMode] = useState<1 | 2 | 3>(1);

  useEffect(() => {
    const check = () => {
      const desktop = window.innerWidth >= 1024;
      setIsDesktopLayout(desktop);
      if (!desktop) setBudgetViewMode((prev) => (prev === 3 ? 2 : prev));
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setBudgetViewMode(window.innerWidth >= 1024 ? 2 : 1);
  }, [isOpen]);

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
