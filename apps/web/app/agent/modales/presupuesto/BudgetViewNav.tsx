'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

import {
  canStepBudgetViewMode,
  getBudgetViewModeLabel,
  stepBudgetViewMode,
} from './budget-modal.view-nav.helpers';
import type { BudgetViewMode } from './use-budget-modal-layout';

type BudgetViewNavProps = {
  isDesktopLayout: boolean;
  budgetViewMode: BudgetViewMode;
  onChange: (mode: BudgetViewMode) => void;
};

export function BudgetViewNav({ isDesktopLayout, budgetViewMode, onChange }: BudgetViewNavProps) {
  const canPrev = canStepBudgetViewMode(budgetViewMode, 'prev', isDesktopLayout);
  const canNext = canStepBudgetViewMode(budgetViewMode, 'next', isDesktopLayout);
  const label = getBudgetViewModeLabel(isDesktopLayout, budgetViewMode);

  return (
    <div className="budget-view-nav" role="toolbar" aria-label="Modo de presupuesto">
      <span className="sr-only" aria-live="polite">
        {label}
      </span>
      <button
        type="button"
        className="budget-view-nav-arrow budget-view-nav-arrow--prev focus-ring"
        aria-label="Vista anterior"
        disabled={!canPrev}
        onClick={() => {
          const nextMode = stepBudgetViewMode(budgetViewMode, 'prev', isDesktopLayout);
          if (nextMode) onChange(nextMode);
        }}
      >
        <ChevronLeft size={28} strokeWidth={2.6} aria-hidden />
      </button>
      <button
        type="button"
        className="budget-view-nav-arrow budget-view-nav-arrow--next focus-ring"
        aria-label="Vista siguiente"
        disabled={!canNext}
        onClick={() => {
          const nextMode = stepBudgetViewMode(budgetViewMode, 'next', isDesktopLayout);
          if (nextMode) onChange(nextMode);
        }}
      >
        <ChevronRight size={28} strokeWidth={2.6} aria-hidden />
      </button>
    </div>
  );
}
