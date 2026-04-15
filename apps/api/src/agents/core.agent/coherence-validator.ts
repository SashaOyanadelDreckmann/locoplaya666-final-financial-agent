/**
 * coherence-validator.ts
 *
 * PHASE 9: Coherence Validation Middleware
 * Validates every agent decision against user's profile/history
 * Used in ReAct loop to ensure recommendations are coherent
 */

import { FinancialDiagnosticProfile } from '../../schemas/profile.schema';
import { IntakeQuestionnaire } from '@financial-agent/shared/src/intake/intake-questionnaire.types';
import { BudgetSummary, validateRecommendation } from '../../services/panel-state.service';

export interface CoherenceValidationResult {
  isCoherent: boolean;
  score: number; // 0-1
  warnings: string[];
  suggestions: string[];
}

export interface FullUserContext {
  profile: FinancialDiagnosticProfile | null;
  intake: IntakeQuestionnaire | null;
  budget: BudgetSummary;
  history: Array<{ role: string; content: string }>;
}

/**
 * Validate an agent decision against user's complete context.
 * Returns coherence score and warnings.
 */
export function validateAgentDecision(
  decision: string,
  userContext: FullUserContext
): CoherenceValidationResult {
  const warnings: string[] = [];
  const suggestions: string[] = [];
  let score = 1.0;

  if (!userContext.profile || !userContext.intake) {
    return {
      isCoherent: true,
      score: 0.8, // Reduced confidence without profile
      warnings: ['No profile/intake available for coherence check'],
      suggestions: [],
    };
  }

  const profile = userContext.profile;
  const intake = userContext.intake;
  const budget = userContext.budget;

  // Check 1: Validate recommendation against profile
  const validation = validateRecommendation(decision, profile, budget, intake);
  if (!validation.valid) {
    warnings.push(...validation.conflicts);
    score *= validation.confidence;
  }

  // Check 2: Consistency with history
  const historyWarnings = checkHistoryConsistency(decision, userContext.history);
  warnings.push(...historyWarnings.warnings);
  score *= historyWarnings.score;

  // Check 3: Income proportionality
  const monthlyIncome = intake.exactMonthlyIncome ?? 0;
  const annualIncome = monthlyIncome * 12;
  const incomeWarnings = checkIncomeProportionality(decision, annualIncome);
  warnings.push(...incomeWarnings.warnings);
  score *= incomeWarnings.score;

  // Check 4: Risk tolerance alignment
  const riskWarnings = checkRiskToleranceAlignment(decision, intake, profile);
  warnings.push(...riskWarnings.warnings);
  score *= riskWarnings.score;
  suggestions.push(...riskWarnings.suggestions);

  // Check 5: Financial knowledge level
  const knowledgeWarnings = checkFinancialKnowledgeAlignment(decision, intake);
  warnings.push(...knowledgeWarnings.warnings);
  score *= knowledgeWarnings.score;

  // Check 6: Debt situation
  const debtWarnings = checkDebtAlignment(decision, intake, budget);
  warnings.push(...debtWarnings.warnings);
  score *= debtWarnings.score;

  // Check 7: Emergency fund status
  const emergencyWarnings = checkEmergencyFundAlignment(decision, budget);
  warnings.push(...emergencyWarnings.warnings);
  score *= emergencyWarnings.score;

  // Check 8: Time horizon alignment
  const horizonWarnings = checkTimeHorizonAlignment(decision, profile);
  warnings.push(...horizonWarnings.warnings);
  score *= horizonWarnings.score;

  // Normalize score
  score = Math.max(0, Math.min(1, score));

  return {
    isCoherent: score >= 0.6,
    score,
    warnings: [...new Set(warnings)], // Deduplicate
    suggestions: [...new Set(suggestions)],
  };
}

function checkHistoryConsistency(
  decision: string,
  history: Array<{ role: string; content: string }>
): { warnings: string[]; score: number } {
  const warnings: string[] = [];
  let score = 1.0;

  if (history.length < 2) {
    return { warnings: [], score: 0.9 }; // Limited history, less penalization
  }

  // Check for contradictions with recent decisions
  const recentHistory = history.slice(-4); // Last 4 messages
  const recentContent = recentHistory.map((h) => h.content).join(' ');

  // Look for conflicting keywords
  const conflictPairs = [
    ['conservative', 'aggressive'],
    ['conservador', 'alto riesgo'],
    ['seguro', 'riesgo'],
    ['safe', 'risky'],
    ['short-term', 'long-term'],
    ['corto plazo', '20 años'],
    ['corto plazo', 'largo plazo'],
    ['stable', 'volatile'],
  ];

  for (const [keyword1, keyword2] of conflictPairs) {
    const hasKeyword1 = new RegExp(`\\b${keyword1}\\b`, 'i').test(recentContent);
    const hasKeyword2 = new RegExp(`\\b${keyword2}\\b`, 'i').test(decision);

    if (hasKeyword1 && hasKeyword2) {
      warnings.push(`Potential contradiction with recent history: "${keyword1}" vs "${keyword2}"`);
      score -= 0.18;
    }
  }

  return { warnings, score: Math.max(0.5, score) };
}

function checkIncomeProportionality(
  decision: string,
  annualIncome: number
): { warnings: string[]; score: number } {
  const warnings: string[] = [];
  let score = 1.0;
  const monthlyIncome = annualIncome / 12;

  if (annualIncome <= 0) {
    return { warnings: [], score: 0.9 };
  }

  const amountMatch = decision.match(/\$?([\d,]+(?:\.\d{2})?)/);
  if (!amountMatch) {
    return { warnings: [], score: 0.95 }; // No specific amount mentioned
  }

  const recommendedAmount = parseFloat(amountMatch[1].replace(/,/g, ''));
  const isMonthlyRecommendation =
    /\b(mensual|mensualmente|al mes|por mes|mes)\b/i.test(decision);
  const comparableIncome = isMonthlyRecommendation && monthlyIncome > 0 ? monthlyIncome : annualIncome;
  const incomeLabel = isMonthlyRecommendation ? 'monthly income' : 'income';
  const percentOfIncome = (recommendedAmount / comparableIncome) * 100;

  if (percentOfIncome > 100) {
    warnings.push(`Recommendation (${percentOfIncome.toFixed(0)}% of ${incomeLabel}) exceeds available income`);
    score -= 0.45;
  } else if (percentOfIncome > 50) {
    warnings.push(`High recommendation (${percentOfIncome.toFixed(0)}% of ${incomeLabel})`);
    score -= 0.22;
  } else if (percentOfIncome < 1 && recommendedAmount > 1000) {
    // Reasonable small percentage
    score += 0.05;
  }

  return { warnings, score: Math.max(0.4, score) };
}

function checkRiskToleranceAlignment(
  decision: string,
  intake: IntakeQuestionnaire,
  profile: FinancialDiagnosticProfile
): { warnings: string[]; suggestions: string[]; score: number } {
  const warnings: string[] = [];
  const suggestions: string[] = [];
  let score = 1.0;

  const isRiskAverse = intake.riskReaction === 'sell' || intake.riskReaction === 'never_invest';
  const isAnxious = profile.profile.emotionalPattern === 'anxious';

  if ((isRiskAverse || isAnxious) && /aggressive|growth|leverage|margin|opciones|alto riesgo|startups|5x/i.test(decision)) {
    warnings.push('Risk-averse profile but decision suggests aggressive approach');
    score -= 0.28;
    suggestions.push('Consider more conservative alternatives for this user');
  }

  if (intake.riskReaction === 'buy_more' && /safe|conservative|stable|renta fija|100% del portafolio/i.test(decision)) {
    warnings.push('Risk-tolerant profile but decision is overly conservative');
    score -= 0.22;
    suggestions.push('User may be frustrated with too-conservative recommendations');
  }

  return { warnings, suggestions, score: Math.max(0.3, score) };
}

function checkFinancialKnowledgeAlignment(
  decision: string,
  intake: IntakeQuestionnaire
): { warnings: string[]; score: number } {
  const warnings: string[] = [];
  let score = 1.0;

  const knowledge = intake.selfRatedUnderstanding ?? 5;
  const complexTerms = [
    'derivative',
    'hedge',
    'options',
    'opciones',
    'leverage',
    'arbitrage',
    'structured',
    'synthetic',
    'correlation',
    'collar',
    'volatility smile',
  ];

  const hasComplexTerms = complexTerms.some((term) => new RegExp(`\\b${term}\\b`, 'i').test(decision));

  if (knowledge < 4 && hasComplexTerms) {
    warnings.push('Complex financial terminology used for user with lower self-rated knowledge');
    score -= 0.15;
  }

  if (knowledge < 3 && /option|future|derivative|opciones|futuros/i.test(decision)) {
    warnings.push('Derivatives/advanced products recommended to novice investor');
    score -= 0.25;
  }

  return { warnings, score: Math.max(0.3, score) };
}

function checkDebtAlignment(
  decision: string,
  intake: IntakeQuestionnaire,
  budget: BudgetSummary
): { warnings: string[]; score: number } {
  const warnings: string[] = [];
  let score = 1.0;

  const debtToIncome = budget.debt_to_income_pct ?? 0;
  const hasDebt = intake.hasDebt || debtToIncome > 0;

  if (!hasDebt) {
    return { warnings: [], score: 1.0 }; // No debt, no problem
  }

  // User has debt
  if (/invest|growth|market|equity|crypto|startups|fondos accionarios/i.test(decision)) {
    if (debtToIncome > 30) {
      warnings.push('High debt-to-income ratio; should focus on debt reduction before investing');
      score -= 0.22;
    } else if (debtToIncome > 20) {
      warnings.push('Moderate debt; consider debt reduction alongside investing');
      score -= 0.08;
    }
  }

  if (debtToIncome > 50 && /speculative|risky|high.return|alto riesgo|startups|crypto/i.test(decision)) {
    warnings.push('Very high debt ratio; speculative investments not recommended');
    score -= 0.4;
  }

  return { warnings, score: Math.max(0.2, score) };
}

function checkEmergencyFundAlignment(
  decision: string,
  budget: BudgetSummary
): { warnings: string[]; score: number } {
  const warnings: string[] = [];
  let score = 1.0;

  const emergencyMonths = budget.emergency_fund_months ?? 0;

  if (emergencyMonths < 1) {
    if (/invest|growth|market|fondos accionarios|portfolio/i.test(decision)) {
      warnings.push('No emergency fund; should build one before investing');
      score -= 0.4;
    }
  } else if (emergencyMonths < 3) {
    if (/aggressive|speculative|fondos accionarios|alto riesgo/i.test(decision)) {
      warnings.push('Emergency fund below 3 months; recommend conservative approach');
      score -= 0.22;
    }
  }

  if (emergencyMonths >= 6) {
    score += 0.1; // Strong emergency fund supports more flexible recommendations
  }

  return { warnings, score: Math.max(0.1, score) };
}

function checkTimeHorizonAlignment(
  decision: string,
  profile: FinancialDiagnosticProfile
): { warnings: string[]; score: number } {
  const warnings: string[] = [];
  let score = 1.0;

  if (
    profile.profile.timeHorizon === 'short_term' &&
    /retirement|long.term|compound|decades|retiro|20 años|30 años|largo plazo/i.test(decision)
  ) {
    warnings.push('Time horizon mismatch: short-term profile but decision implies a long horizon');
    score -= 0.22;
  }

  return { warnings, score: Math.max(0.3, score) };
}

/**
 * Format validation result as user-friendly message.
 */
export function formatValidationMessage(result: CoherenceValidationResult): string {
  if (result.isCoherent) {
    return `✓ Recommendation is coherent with your profile (confidence: ${(result.score * 100).toFixed(0)}%)`;
  }

  const warningText = result.warnings.length > 0 ? `\n⚠️ ${result.warnings.join('\n⚠️ ')}` : '';
  const suggestText = result.suggestions.length > 0 ? `\n💡 ${result.suggestions.join('\n💡 ')}` : '';

  return `⚠️ Low coherence (${(result.score * 100).toFixed(0)}%)${warningText}${suggestText}`;
}
