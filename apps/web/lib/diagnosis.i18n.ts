import { FinancialProfileTraits } from '@/state/profile.store';

/* ────────────────────────────── */
/* Traducciones de diagnóstico    */
/* ────────────────────────────── */

export const financialClarityMap: Record<
  FinancialProfileTraits['financialClarity'],
  string
> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
};

export const decisionStyleMap: Record<
  FinancialProfileTraits['decisionStyle'],
  string
> = {
  reactive: 'Reactivo',
  analytical: 'Analítico',
  avoidant: 'Evitativo',
  delegated: 'Delegado',
  mixed: 'Mixto',
};

export const timeHorizonMap: Record<
  FinancialProfileTraits['timeHorizon'],
  string
> = {
  short_term: 'Corto plazo',
  mixed: 'Mixto',
  long_term: 'Largo plazo',
};

export const financialPressureMap: Record<
  FinancialProfileTraits['financialPressure'],
  string
> = {
  low: 'Baja',
  moderate: 'Moderada',
  high: 'Alta',
};

export const emotionalPatternMap: Record<
  FinancialProfileTraits['emotionalPattern'],
  string
> = {
  neutral: 'Neutral',
  anxious: 'Ansioso',
  avoidant: 'Evitativo',
  controlling: 'Controlador',
  conflicted: 'Conflictuado',
};
