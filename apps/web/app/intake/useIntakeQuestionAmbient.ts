'use client';

import { useEffect } from 'react';

/** Sync question progress into CSS vars so the ambient orb drifts as questions advance. */
export function useIntakeQuestionAmbient(questionIndex: number, totalQuestions: number) {
  useEffect(() => {
    const shell = document.querySelector<HTMLElement>('.intake-shell');
    if (!shell) return;

    const phase = totalQuestions <= 1 ? 0 : questionIndex / (totalQuestions - 1);
    const shiftX = (phase - 0.5) * 96;
    const shiftY = phase * 8;

    shell.style.setProperty('--intake-q-phase', String(phase));
    shell.style.setProperty('--intake-q-shift-x', `${shiftX}px`);
    shell.style.setProperty('--intake-q-shift-y', `${shiftY}%`);
    shell.dataset.qIndex = String(questionIndex);
    shell.dataset.qTotal = String(totalQuestions);

    return () => {
      shell.style.removeProperty('--intake-q-phase');
      shell.style.removeProperty('--intake-q-shift-x');
      shell.style.removeProperty('--intake-q-shift-y');
      delete shell.dataset.qIndex;
      delete shell.dataset.qTotal;
    };
  }, [questionIndex, totalQuestions]);
}
