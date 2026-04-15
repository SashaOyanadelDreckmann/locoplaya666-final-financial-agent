/**
 * knowledge.service.ts
 *
 * PHASE 9.2: Knowledge Score Backend Service
 * Tracks user financial knowledge with persistent memory across sessions.
 * Connected to agent - updates based on interactions, not just display.
 */

import { getLogger } from '../logger';
import type { IntakeQuestionnaire } from '@financial-agent/shared/src/intake/intake-questionnaire.types';
import {
  loadUserKnowledgeState,
  updateUserKnowledgeState,
} from './user.service';

export interface KnowledgeTracker {
  userId: string;
  baseScore: number; // 0-100: baseline knowledge level
  sessionGains: number; // Points earned this session
  totalGains: number; // Lifetime accumulated points
  lastUpdated: string; // ISO timestamp
  history: KnowledgeEvent[]; // Event log for audit trail
}

export interface KnowledgeEvent {
  timestamp: string;
  action: KnowledgeAction;
  points: number; // Can be negative (mistakes)
  rationale: string;
  context?: Record<string, unknown>;
}

export type KnowledgeAction =
  | 'completed_intake' // +20 — User completed financial intake questionnaire
  | 'completed_profile' // +25 — Financial diagnostic completed
  | 'analyzed_budget' // +15 — Analyzed own presupuesto
  | 'learned_concept' // +5 — Engaged with educational content
  | 'simulated_scenario' // +10 — Ran financial simulation
  | 'understood_risk' // +8 — Demonstrated risk understanding
  | 'optimized_apv' // +12 — Used APV optimizer tool
  | 'debt_analysis' // +10 — Analyzed debt situation
  | 'goal_planned' // +15 — Created financial goal plan
  | 'portfolio_balanced' // +12 — Balanced investment portfolio
  | 'emergency_fund_set' // +18 — Built emergency fund to 3+ months
  | 'diversified_investments' // +14 — Diversified across asset classes
  | 'read_article' // +3 — Read educational article
  | 'asked_good_question' // +5 — Asked clarifying question
  | 'avoided_mistake' // +7 — Avoided risky financial decision (caught by validation)
  | 'documented_learning' // +6 — Saved/shared learning
  | 'made_mistake' // -10 — Made risky decision or showed misunderstanding
  | 'ignored_warning' // -8 — Ignored coherence warning from agent
  | 'session_reset' // -5 — Requested reset/undo of understanding;

export const KNOWLEDGE_MILESTONES = [
  { threshold: 0, feature: 'Acceso básico (chat educativo)' },
  { threshold: 20, feature: 'Cuestionario y perfil financiero' },
  { threshold: 40, feature: 'Presupuesto personalizado' },
  { threshold: 55, feature: '📊 Módulo PRESUPUESTO (panel)' },
  { threshold: 70, feature: 'Análisis de deuda' },
  { threshold: 74, feature: '💳 Módulo CARTOLAS (panel)' },
  { threshold: 85, feature: 'Estrategias avanzadas' },
  { threshold: 100, feature: '🏆 Experto financiero (badge)' },
] as const;

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function sumHistoryPoints(history: KnowledgeEvent[]): number {
  return history.reduce((sum, event) => sum + event.points, 0);
}

function hasRecordedAction(history: KnowledgeEvent[], action: KnowledgeAction): boolean {
  return history.some((event) => event.action === action);
}

function estimateBaseKnowledgeScore(intake: IntakeQuestionnaire): number {
  let score = 5;

  score += Math.max(0, Math.min(10, intake.selfRatedUnderstanding ?? 0)) * 6;

  const productsCount = Array.isArray(intake.financialProducts)
    ? intake.financialProducts.filter((product) => product?.product).length
    : 0;
  score += Math.min(productsCount * 3, 15);

  if (intake.financialKnowledge) {
    const knownTopics = Object.values(intake.financialKnowledge).filter(Boolean).length;
    score += Math.min(knownTopics * 2, 20);
  }

  if (intake.hasSavingsOrInvestments) {
    score += 5;
  }

  if (intake.tracksExpenses === 'yes') {
    score += 5;
  }

  return clampScore(score);
}

function deriveBaseScore(
  userData: {
    knowledgeBaseScore?: number;
    knowledgeScore?: number;
  },
  totalGains: number,
): number {
  if (
    Number.isFinite(userData.knowledgeBaseScore) &&
    Number(userData.knowledgeBaseScore) > 0
  ) {
    return clampScore(Number(userData.knowledgeBaseScore));
  }

  if (Number.isFinite(userData.knowledgeScore) && Number(userData.knowledgeScore) > 0) {
    return clampScore(Number(userData.knowledgeScore) - totalGains);
  }

  if (Number.isFinite(userData.knowledgeBaseScore)) {
    return clampScore(Number(userData.knowledgeBaseScore));
  }

  return 0;
}

async function persistKnowledgeTracker(userId: string, tracker: KnowledgeTracker): Promise<void> {
  const finalScore = clampScore(tracker.baseScore + tracker.totalGains);

  try {
    const updated = await updateUserKnowledgeState(userId, {
      knowledgeBaseScore: tracker.baseScore,
      knowledgeScore: finalScore,
      knowledgeHistory: tracker.history,
      knowledgeLastUpdated: tracker.lastUpdated,
    });
    if (!updated) {
      getLogger().warn({
        msg: '[Knowledge] User not found while persisting tracker',
        userId,
      });
    }
  } catch (err) {
    getLogger().warn({
      msg: '[Knowledge] Failed to persist tracker',
      userId,
      error: err,
    });
  }
}

/**
 * Get user's knowledge tracker from persistent storage
 */
export async function getKnowledgeTracker(userId: string): Promise<KnowledgeTracker> {
  try {
    const stored = await loadUserKnowledgeState(userId);
    if (stored) {
      const history = Array.isArray(stored.knowledgeHistory)
        ? (stored.knowledgeHistory as KnowledgeEvent[])
        : [];
      const totalGains = sumHistoryPoints(history);
      const baseScore = deriveBaseScore(stored, totalGains);

      return {
        userId,
        baseScore,
        sessionGains: 0,
        totalGains,
        lastUpdated: stored.knowledgeLastUpdated ?? new Date().toISOString(),
        history,
      };
    }

    return {
      userId,
      baseScore: 0,
      sessionGains: 0,
      totalGains: 0,
      lastUpdated: new Date().toISOString(),
      history: [],
    };
  } catch {
    return {
      userId,
      baseScore: 0,
      sessionGains: 0,
      totalGains: 0,
      lastUpdated: new Date().toISOString(),
      history: [],
    };
  }
}

/**
 * Update knowledge score when agent detects learning event
 * Called by agent after user interaction/tool usage
 */
export async function recordKnowledgeEvent(
  userId: string,
  action: KnowledgeAction,
  rationale: string,
  context?: Record<string, unknown>,
): Promise<{ newScore: number; points: number }> {
  const tracker = await getKnowledgeTracker(userId);

  if (
    (action === 'completed_intake' || action === 'completed_profile') &&
    hasRecordedAction(tracker.history, action)
  ) {
    return {
      newScore: clampScore(tracker.baseScore + tracker.totalGains),
      points: 0,
    };
  }

  // Point values for each action
  const pointsMap: Record<KnowledgeAction, number> = {
    'completed_intake': 20,
    'completed_profile': 25,
    'analyzed_budget': 15,
    'learned_concept': 5,
    'simulated_scenario': 10,
    'understood_risk': 8,
    'optimized_apv': 12,
    'debt_analysis': 10,
    'goal_planned': 15,
    'portfolio_balanced': 12,
    'emergency_fund_set': 18,
    'diversified_investments': 14,
    'read_article': 3,
    'asked_good_question': 5,
    'avoided_mistake': 7,
    'documented_learning': 6,
    'made_mistake': -10,
    'ignored_warning': -8,
    'session_reset': -5,
  };

  const points = pointsMap[action] ?? 0;

  // Add to history
  const eventTimestamp = new Date().toISOString();
  tracker.history.push({
    timestamp: eventTimestamp,
    action,
    points,
    rationale,
    context,
  });

  // Update scores
  tracker.sessionGains += points;
  tracker.totalGains += points;
  tracker.lastUpdated = eventTimestamp;

  const finalScore = clampScore(tracker.baseScore + tracker.totalGains);
  await persistKnowledgeTracker(userId, tracker);

  return {
    newScore: finalScore,
    points,
  };
}

export async function synchronizeKnowledgeFromIntake(
  userId: string,
  intake: IntakeQuestionnaire
): Promise<{ score: number; baseScore: number }> {
  const tracker = await getKnowledgeTracker(userId);
  tracker.baseScore = estimateBaseKnowledgeScore(intake);
  tracker.lastUpdated = new Date().toISOString();
  await persistKnowledgeTracker(userId, tracker);

  return {
    score: clampScore(tracker.baseScore + tracker.totalGains),
    baseScore: tracker.baseScore,
  };
}

/**
 * Calculate effective knowledge score considering:
 * - Base knowledge from intake
 * - Gains from actions
 * - Session resets/mistakes
 */
export async function calculateEffectiveScore(userId: string): Promise<{
  score: number;
  breakdown: {
    baseScore: number;
    sessionGains: number;
    totalGains: number;
    adjustments: number;
  };
  unlocked: {
    presupuesto: boolean; // >= 55
    cartolas: boolean; // >= 74
    advanced: boolean; // >= 85
  };
}> {
  const tracker = await getKnowledgeTracker(userId);

  const effectiveScore = clampScore(tracker.baseScore + tracker.totalGains);

  return {
    score: effectiveScore,
    breakdown: {
      baseScore: tracker.baseScore,
      sessionGains: tracker.sessionGains,
      totalGains: tracker.totalGains,
      adjustments: 0,
    },
    unlocked: {
      presupuesto: effectiveScore >= 55,
      cartolas: effectiveScore >= 74,
      advanced: effectiveScore >= 85,
    },
  };
}

/**
 * Get learning recommendations based on knowledge gaps
 * Agent uses this to suggest learning paths
 */
export async function getKnowledgeLearningPath(
  userId: string,
  _userProfile: unknown,
): Promise<string[]> {
  const { score } = await calculateEffectiveScore(userId);

  const recommendations: string[] = [];

  if (score < 20) {
    recommendations.push(
      'Completa el cuestionario financiero para establecer tu baseline',
      'Lee: "Conceptos básicos de finanzas personales"',
      'Entiende qué es interés compuesto'
    );
  }

  if (score < 40) {
    recommendations.push(
      'Aprende sobre fondo de emergencia (3-6 meses)',
      'Entiende la diferencia entre deuda buena y mala',
      'Completa tu presupuesto personal'
    );
  }

  if (score < 60) {
    recommendations.push(
      'Aprende sobre inversión en fondos mutuales',
      'Entiende diversificación de cartera',
      'Explora simulaciones de escenarios futuros'
    );
  }

  if (score < 80) {
    recommendations.push(
      'Domina optimización de APV y tributaria',
      'Aprende sobre asset allocation según horizonte',
      'Entiende opciones de retiro y pensión'
    );
  }

  if (score < 100) {
    recommendations.push(
      'Explora estrategias avanzadas de inversión',
      'Aprende sobre hedge y cobertura de riesgos',
      'Entiende mercados de derivados'
    );
  }

  return recommendations;
}

/**
 * Reset knowledge score (user request to start over)
 */
export async function resetKnowledgeScore(userId: string): Promise<KnowledgeTracker> {
  const tracker = await getKnowledgeTracker(userId);

  // Record the reset event
  const resetTimestamp = new Date().toISOString();
  tracker.history.push({
    timestamp: resetTimestamp,
    action: 'session_reset',
    points: -5,
    rationale: 'User requested knowledge reset',
  });

  // Reset session gains but keep total history
  tracker.sessionGains = 0;
  tracker.totalGains += -5; // Apply the penalty
  tracker.lastUpdated = resetTimestamp;

  await persistKnowledgeTracker(userId, tracker);

  return tracker;
}

/**
 * Get knowledge delta since last interaction
 * Used by agent to detect recent learning
 */
export async function getKnowledgeDelta(
  userId: string,
  sinceLast: number = 3600000 // 1 hour in ms
): Promise<{
  delta: number;
  events: KnowledgeEvent[];
  trend: 'increasing' | 'stable' | 'decreasing';
}> {
  const tracker = await getKnowledgeTracker(userId);
  const cutoff = Date.now() - sinceLast;

  const recentEvents = tracker.history.filter(
    (e) => new Date(e.timestamp).getTime() > cutoff
  );

  const delta = recentEvents.reduce((sum, e) => sum + e.points, 0);

  const trend: 'increasing' | 'stable' | 'decreasing' =
    delta > 10 ? 'increasing' : delta < -5 ? 'decreasing' : 'stable';

  return {
    delta,
    events: recentEvents,
    trend,
  };
}

/**
 * Milestones achieved at knowledge score thresholds
 */
export function getMilestones(score: number): {
  unlocked: string[];
  next: { threshold: number; feature: string };
} {
  const unlocked = KNOWLEDGE_MILESTONES
    .filter((m) => m.threshold <= score)
    .map((m) => m.feature);

  const nextMilestone = KNOWLEDGE_MILESTONES.find((m) => m.threshold > score);

  return {
    unlocked,
    next: nextMilestone ?? { threshold: 100, feature: 'Máximo nivel alcanzado' },
  };
}
