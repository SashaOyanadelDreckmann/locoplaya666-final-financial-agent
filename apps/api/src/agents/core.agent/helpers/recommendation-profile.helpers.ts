import type { InferredUserModel } from '../agent-types';
import {
  resolveActionPlanFunnelStage,
  type ActionPlanFunnelStage,
} from '@financial-agent/shared';

type RecommendationProfile = {
  active_chat_id: string;
  specialization: 'general' | 'strategy' | 'social';
  action_plan_funnel_stage?: ActionPlanFunnelStage | null;
  risk_profile: 'conservative' | 'balanced' | 'aggressive';
  horizon_bucket: 'short' | 'medium' | 'long' | 'unknown';
  liquidity_status: 'fragile' | 'stable' | 'strong';
  debt_pressure: 'high' | 'medium' | 'low';
  savings_capacity: 'negative' | 'limited' | 'positive';
  recommendation_scope: Array<'cash_management' | 'debt' | 'apv' | 'investment' | 'institution_comparison'>;
  missing_critical_data: string[];
  suitability_note: string;
  final_decision_disclaimer: string;
};

function toNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function buildRecommendationProfile(params: {
  activeChatId?: unknown;
  budgetSummary?: Record<string, unknown> | null;
  intake?: Record<string, unknown> | null;
  inferredUserModel?: InferredUserModel | null;
  userMessage?: string;
  turnCount?: number;
  closingMode?: boolean;
}): RecommendationProfile {
  const activeChatId = String(params.activeChatId ?? 'chat-1');
  const actionPlanFunnelStage = resolveActionPlanFunnelStage({
    activeChatId,
    turnCount: params.turnCount,
    closingMode: params.closingMode,
    userMessage: params.userMessage,
  });
  const budget = params.budgetSummary ?? {};
  const intake = params.intake ?? {};
  const inferredRisk = params.inferredUserModel?.risk_profile ?? 'balanced';
  const userMessage = String(params.userMessage ?? '').toLowerCase();

  const income = toNumber(budget.income) ?? toNumber(intake.exactMonthlyIncome) ?? 0;
  const expenses = toNumber(budget.expenses) ?? 0;
  const balance = toNumber(budget.balance) ?? income - expenses;
  const debt = intake.hasDebt === true || intake.hasDebt === 'true';
  const savings = intake.hasSavingsOrInvestments === true || intake.hasSavingsOrInvestments === 'true';
  const horizonMonths = params.inferredUserModel?.inferred_horizon_months ?? null;

  const specialization =
    activeChatId === 'chat-2' ? 'strategy' : activeChatId === 'chat-3' ? 'social' : 'general';
  const liquidity_status =
    balance < 0 ? 'fragile' : balance <= income * 0.1 ? 'stable' : 'strong';
  const debt_pressure =
    debt && balance < income * 0.1 ? 'high' : debt ? 'medium' : 'low';
  const savings_capacity =
    balance < 0 ? 'negative' : balance <= income * 0.1 ? 'limited' : 'positive';
  const horizon_bucket =
    horizonMonths === null
      ? 'unknown'
      : horizonMonths <= 12
      ? 'short'
      : horizonMonths <= 60
      ? 'medium'
      : 'long';

  const recommendation_scope: RecommendationProfile['recommendation_scope'] = [];
  recommendation_scope.push('cash_management');
  if (debt) recommendation_scope.push('debt');
  if (/\bapv|retiro|jubil|pension\b/.test(userMessage)) recommendation_scope.push('apv');
  if (/\binversion|invertir|fondo|etf|acciones|cartera|portafolio\b/.test(userMessage) || savings) {
    recommendation_scope.push('investment');
  }
  if (/\bbanco|institucion|afp|corredora|comparar|tasa|beneficio\b/.test(userMessage)) {
    recommendation_scope.push('institution_comparison');
  }

  const missing_critical_data: string[] = [];
  if (!income) missing_critical_data.push('ingreso mensual');
  if (specialization === 'strategy' && horizon_bucket === 'unknown') missing_critical_data.push('horizonte');
  if (specialization === 'strategy' && !/\bobjetivo|meta|casa|auto|viaje|retiro|emergencia\b/.test(userMessage)) {
    missing_critical_data.push('objetivo financiero');
  }
  if (recommendation_scope.includes('investment') && !savings) {
    missing_critical_data.push('colchon de liquidez');
  }

  const suitability_note = [
    `Especializacion: ${specialization}`,
    `Liquidez: ${liquidity_status}`,
    `Presion de deuda: ${debt_pressure}`,
    `Capacidad de ahorro: ${savings_capacity}`,
    `Horizonte: ${horizon_bucket}`,
    `Perfil de riesgo: ${inferredRisk}`,
  ].join(' | ');

  return {
    active_chat_id: activeChatId,
    specialization,
    action_plan_funnel_stage: actionPlanFunnelStage,
    risk_profile: inferredRisk,
    horizon_bucket,
    liquidity_status,
    debt_pressure,
    savings_capacity,
    recommendation_scope: Array.from(new Set(recommendation_scope)),
    missing_critical_data: Array.from(new Set(missing_critical_data)),
    suitability_note,
    final_decision_disclaimer:
      'La decision final debe tomarla el usuario de forma 100% informada; el agente recomienda, no decide por el usuario.',
  };
}
