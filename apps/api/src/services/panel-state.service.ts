/**
 * panel-state.service.ts
 *
 * PHASE 9: Panel State Manager
 * Tracks budget state changes and validates agent recommendations
 * against user constraints (income, risk tolerance, financial knowledge)
 */

import { FinancialDiagnosticProfile } from '../schemas/profile.schema';
import { IntakeQuestionnaire } from '@financial-agent/shared/src/intake/intake-questionnaire.types';

export interface BudgetSummary {
  income: number;
  expenses: number;
  balance: number;
  savings_rate?: number;
  debt_to_income_pct?: number;
  emergency_fund_months?: number;
  [key: string]: unknown;
}

export interface PanelStateValidation {
  valid: boolean;
  rationale: string;
  confidence: number; // 0-1, how confident is this validation
  conflicts: string[]; // List of constraint violations
}

export interface PanelStateChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
  impact: 'low' | 'medium' | 'high';
}

/**
 * Validate a recommendation against user's profile and budget constraints.
 * Example: "Increase emergency fund to $50k" → Check if coherent with income/risk tolerance
 */
export function validateRecommendation(
  recommendation: string,
  userProfile: FinancialDiagnosticProfile | null,
  budgetState: BudgetSummary,
  intake: IntakeQuestionnaire | null
): PanelStateValidation {
  const conflicts: string[] = [];
  let confidence = 1.0;

  if (!userProfile || !intake) {
    return {
      valid: true,
      rationale: 'No profile/intake to validate against',
      confidence: 0.5,
      conflicts: [],
    };
  }

  const profile = userProfile.profile;
  const monthlyIncome = intake.exactMonthlyIncome ?? 0;
  const annualIncome = monthlyIncome * 12;

  // Check 1: Risk tolerance alignment
  if (profile.emotionalPattern === 'anxious' && /aggressive|growth|invest/i.test(recommendation)) {
    conflicts.push('Anxious user should avoid aggressive growth recommendations');
    confidence -= 0.15;
  }

  if (intake.riskReaction === 'sell' && /buy|invest|risk|opciones|leverage|alto riesgo/i.test(recommendation)) {
    conflicts.push('User history shows risk-averse behavior (sells when stressed)');
    confidence -= 0.2;
  }

  // Check 2: Income proportionality
  const amountMatch = recommendation.match(/\$?([\d,]+(?:\.\d{2})?)/);
  if (amountMatch && annualIncome > 0) {
    const recommendedAmount = parseFloat(amountMatch[1].replace(/,/g, ''));
    const isMonthlyRecommendation =
      /\b(mensual|mensualmente|al mes|por mes|mes)\b/i.test(recommendation);
    const comparableIncome = isMonthlyRecommendation && monthlyIncome > 0 ? monthlyIncome : annualIncome;
    const percentOfIncome = (recommendedAmount / comparableIncome) * 100;

    // Red flags
    if (percentOfIncome > 50) {
      conflicts.push(`Recommendation is ${percentOfIncome.toFixed(1)}% of annual income (high)`);
      confidence -= 0.1;
    }

    // Green lights
    if (percentOfIncome < 5) {
      confidence += 0.05; // Conservative is good
    }
  }

  // Check 3: Financial knowledge alignment
  const knowledgeScore = intake.selfRatedUnderstanding ?? 5;
  if (
    knowledgeScore < 4 &&
    /derivative|hedge|options|leverage|arbitrage|structured|synthetic/i.test(recommendation)
  ) {
    conflicts.push('Complex investment recommended but user has low self-rated financial understanding');
    confidence -= 0.15;
  }

  // Check 4: Debt situation
  if (intake.hasDebt && /invest|speculative/i.test(recommendation)) {
    conflicts.push('User has outstanding debt; aggressive investing may not be appropriate');
    confidence -= 0.1;
  }

  // Check 5: Emergency fund vs expenses
  const monthlyExpenses = budgetState.expenses ?? 0;
  const hasEmergencyFund = budgetState.emergency_fund_months ?? 0;
  if (
    hasEmergencyFund < 3 &&
    monthlyExpenses > 0 &&
    /invest|growth|market/i.test(recommendation)
  ) {
    conflicts.push('Emergency fund below 3 months; should stabilize before investing');
    confidence -= 0.1;
  }

  // Check 6: Time horizon alignment
  if (
    profile.timeHorizon === 'short_term' &&
    /retirement|long.term|compound|decades|retiro|20 años|30 años|largo plazo/i.test(recommendation)
  ) {
    conflicts.push('Time horizon mismatch: short-term user but recommendation implies a long horizon');
    confidence -= 0.15;
  }

  // Check 7: Decision style alignment
  if (
    (profile.decisionStyle === 'analytical' ||
      profile.decisionStyle === 'avoidant') &&
    /impulsive|quick|rush|now/i.test(recommendation)
  ) {
    conflicts.push('Recommendation tone conflicts with user decision style');
    confidence -= 0.08;
  }

  // Confidence floor/ceiling
  confidence = Math.max(0.2, Math.min(1.0, confidence));

  return {
    valid: conflicts.length === 0,
    rationale: generateRationale(conflicts, confidence, userProfile, budgetState),
    confidence,
    conflicts,
  };
}

/**
 * Detect changes in panel state (income, expenses, goals).
 * Used to trigger re-evaluation of previous recommendations.
 */
export function detectPanelStateChanges(
  previousBudget: BudgetSummary,
  currentBudget: BudgetSummary
): PanelStateChange[] {
  const changes: PanelStateChange[] = [];

  const threshold = 0.05; // 5% change triggers detection

  // Income change
  const prevIncome = previousBudget.income ?? 0;
  const currIncome = currentBudget.income ?? 0;
  if (prevIncome > 0 && Math.abs(currIncome - prevIncome) / prevIncome > threshold) {
    changes.push({
      field: 'income',
      oldValue: prevIncome,
      newValue: currIncome,
      impact: currIncome > prevIncome ? 'high' : 'high',
    });
  }

  // Expense change
  const prevExpenses = previousBudget.expenses ?? 0;
  const currExpenses = currentBudget.expenses ?? 0;
  if (prevExpenses > 0 && Math.abs(currExpenses - prevExpenses) / prevExpenses > threshold) {
    changes.push({
      field: 'expenses',
      oldValue: prevExpenses,
      newValue: currExpenses,
      impact: 'medium',
    });
  }

  // Emergency fund change
  const prevEmergency = previousBudget.emergency_fund_months ?? 0;
  const currEmergency = currentBudget.emergency_fund_months ?? 0;
  if (prevEmergency !== currEmergency) {
    changes.push({
      field: 'emergency_fund_months',
      oldValue: prevEmergency,
      newValue: currEmergency,
      impact: currEmergency < prevEmergency ? 'high' : 'medium',
    });
  }

  return changes;
}

/**
 * Generate human-readable rationale for validation result.
 */
function generateRationale(
  conflicts: string[],
  confidence: number,
  profile: FinancialDiagnosticProfile,
  budget: BudgetSummary
): string {
  if (conflicts.length === 0) {
    const profileNarrative = `User profile: ${profile.profile.financialClarity} clarity, ${profile.profile.decisionStyle} decision style, ${profile.profile.timeHorizon} horizon`;
    const budgetNarrative = `Budget: $${budget.income?.toLocaleString() ?? 'unknown'} income, ${((budget.balance ?? 0) / (budget.income ?? 1) * 100).toFixed(1)}% savings rate`;
    return `✓ Recommendation aligns with user profile. ${profileNarrative}. ${budgetNarrative}`;
  }

  return `⚠️ Potential conflicts detected: ${conflicts.join('; ')}. Confidence: ${(confidence * 100).toFixed(0)}%`;
}

/**
 * Calculate a coherence score for a user's financial profile.
 * 0 = completely inconsistent (e.g., says they're risk-averse but took huge losses)
 * 1 = perfectly coherent
 */
export function calculateCoherenceScore(
  profile: FinancialDiagnosticProfile,
  intake: IntakeQuestionnaire,
  budget: BudgetSummary
): number {
  let score = 1.0;
  const monthlyIncome = intake.exactMonthlyIncome ?? 0;
  const annualIncome = monthlyIncome * 12;

  // Penalize inconsistencies
  const tensions = profile.tensions ?? [];
  score -= tensions.length * 0.05; // Each tension = -5%

  // Risk reaction vs decision style
  const riskAvoidant = intake.riskReaction === 'sell' || intake.riskReaction === 'never_invest';
  const aggressiveStyle = profile.profile.decisionStyle === 'analytical'; // Analytical can be aggressive
  if (riskAvoidant && aggressiveStyle) {
    score -= 0.1; // Conflicting signals
  }

  // Savings behavior vs financial clarity
  const hasSavings = intake.exactSavingsAmount && intake.exactSavingsAmount > 0;
  const lowClarity = profile.profile.financialClarity === 'low';
  if (!hasSavings && lowClarity) {
    score -= 0.05; // Plausible but concerning
  }

  // Emergency fund vs expenses
  const monthlyExpenses = budget.expenses ?? 0;
  const emergencyMonths = budget.emergency_fund_months ?? 0;
  const hasDebt = intake.hasDebt;

  if (hasDebt && emergencyMonths < 1) {
    score -= 0.1; // Should have emergency fund before taking debt
  }

  if (monthlyExpenses > annualIncome * 0.1 && emergencyMonths < 3) {
    score -= 0.08; // High expense ratio with low emergency fund
  }

  // Stress level vs behavior
  const stressLevel = intake.moneyStressLevel ?? 5;
  const emotionalPattern = profile.profile.emotionalPattern;
  if (stressLevel > 7 && emotionalPattern === 'neutral') {
    score -= 0.05; // Reporting high stress but profile says neutral (possible denial)
  }

  return Math.max(0, Math.min(1, score));
}
