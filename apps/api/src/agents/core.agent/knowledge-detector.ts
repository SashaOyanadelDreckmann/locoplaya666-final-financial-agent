/**
 * knowledge-detector.ts
 *
 * PHASE 9.2: Knowledge Event Detector
 * Analyzes agent actions and user interactions to identify learning events.
 * Connected to core agent - automatically detects when to award knowledge points.
 */

import { KnowledgeAction } from '../../services/knowledge.service';

export interface KnowledgeEventDetection {
  detected: boolean;
  action: KnowledgeAction | null;
  confidence: number; // 0-1
  rationale: string;
}

/**
 * Analyze agent response to detect learning events
 * Called after each agent response to identify knowledge-building activities
 */
export function detectKnowledgeEvent(params: {
  userMessage: string;
  agentResponse: string;
  toolsUsed: string[];
  mode: string;
  previousScore: number;
  userProfile: any;
}): KnowledgeEventDetection {
  const { userMessage, agentResponse, toolsUsed, mode, previousScore, userProfile } = params;
  const normalizedUserMessage = userMessage.toLowerCase();
  const normalizedAgentResponse = agentResponse.toLowerCase();

  // Check for budget analysis
  if (
    toolsUsed.includes('finance.budget_analyzer') &&
    mode === 'budgeting'
  ) {
    return {
      detected: true,
      action: 'analyzed_budget',
      confidence: 0.8,
      rationale: 'User analyzed their budget with finance tools',
    };
  }

  // Check for simulation/scenario analysis
  if (
    toolsUsed.includes('finance.simulate') ||
    toolsUsed.includes('finance.simulate_montecarlo') ||
    toolsUsed.includes('finance.scenario_projection') ||
    (
      mode === 'simulation' &&
      /simulat|escenario|proyect|scenario/i.test(normalizedUserMessage) &&
      /[\$]?\d{3,}|\b\d+\s*(mes|meses|años|anos|%)\b/i.test(normalizedUserMessage)
    )
  ) {
    return {
      detected: true,
      action: 'simulated_scenario',
      confidence: 0.75,
      rationale: 'User ran financial simulations to understand outcomes',
    };
  }

  // Check for risk understanding
  if (
    mode === 'decision_support' &&
    /risk.*toler|riesgo.*toler|conserv|agres|volatil/i.test(normalizedUserMessage)
  ) {
    return {
      detected: true,
      action: 'understood_risk',
      confidence: 0.7,
      rationale: 'User demonstrated understanding of risk tolerance',
    };
  }

  // Check for APV optimization
  if (
    toolsUsed.includes('finance.apv_optimizer') ||
    /apv|aporto.*volunt|tributario/i.test(normalizedUserMessage)
  ) {
    return {
      detected: true,
      action: 'optimized_apv',
      confidence: 0.8,
      rationale: 'User learned about and optimized APV contributions',
    };
  }

  // Check for debt analysis
  if (
    toolsUsed.includes('finance.debt_analyzer') ||
    (mode === 'decision_support' && /deuda|crédito|hipotecario/i.test(normalizedUserMessage))
  ) {
    return {
      detected: true,
      action: 'debt_analysis',
      confidence: 0.75,
      rationale: 'User analyzed debt situation and options',
    };
  }

  // Check for goal planning
  if (
    toolsUsed.includes('finance.goal_planner') ||
    mode === 'planification'
  ) {
    return {
      detected: true,
      action: 'goal_planned',
      confidence: 0.8,
      rationale: 'User created and planned financial goals',
    };
  }

  // Check for portfolio balancing
  if (
    /diversif|balanc|portafolio|cartera.*diversa/i.test(normalizedUserMessage) &&
    mode === 'decision_support'
  ) {
    return {
      detected: true,
      action: 'portfolio_balanced',
      confidence: 0.7,
      rationale: 'User learned about portfolio diversification',
    };
  }

  // Check for emergency fund establishment
  if (
    /fondo.*emergencia|emergency.*fund|3.*mes|6.*mes|contingenc/i.test(normalizedUserMessage) &&
    previousScore < 40
  ) {
    return {
      detected: true,
      action: 'emergency_fund_set',
      confidence: 0.75,
      rationale: 'User established emergency fund understanding',
    };
  }

  // Check for educational content engagement
  if (
    mode === 'education' &&
    /entend|apre|concept|defin|explica/i.test(normalizedUserMessage)
  ) {
    return {
      detected: true,
      action: 'learned_concept',
      confidence: 0.65,
      rationale: 'User engaged with educational content',
    };
  }

  // Check for good questions
  if (
    /\?/.test(userMessage) &&
    normalizedUserMessage.trim().length >= 30 &&
    /(por qu[eé]|c[oó]mo|conviene|deber[ií]a|impacta|diferencia|alternativa|compar)/i.test(normalizedUserMessage)
  ) {
    // Asks specific questions, not just basic ones
    return {
      detected: true,
      action: 'asked_good_question',
      confidence: 0.6,
      rationale: 'User asked clarifying or advanced questions',
    };
  }

  // Check for avoided mistakes (coherence validation)
  if (
    /evit.*error|risk.*alto|no.*adecuad|incoherent/i.test(normalizedAgentResponse) &&
    (userProfile?.profile?.coherenceScore ?? userProfile?.coherenceScore ?? 0) > 0.7
  ) {
    return {
      detected: true,
      action: 'avoided_mistake',
      confidence: 0.7,
      rationale: 'User avoided financially risky decision',
    };
  }

  // Check for mistakes (ignored coherence warnings)
  if (
    /ignor.*advert|proceder.*riesgo|a pesar.*warn/i.test(normalizedUserMessage)
  ) {
    return {
      detected: true,
      action: 'ignored_warning',
      confidence: 0.8,
      rationale: 'User proceeded despite coherence warnings',
    };
  }

  // Default: no event detected
  return {
    detected: false,
    action: null,
    confidence: 0,
    rationale: 'No knowledge-building event detected in this interaction',
  };
}

/**
 * Get next learning recommendation based on current score
 * Used to guide user toward specific knowledge milestones
 */
export function getNextLearningFocus(score: number): {
  focus: string;
  topic: string;
  suggestedAction: string;
}[] {
  const recommendations = [
    {
      score: 0,
      focus: 'Fundamentals',
      topic: 'Interest and compound interest',
      suggestedAction: 'Read: "Power of Compound Interest"',
    },
    {
      score: 10,
      focus: 'Foundations',
      topic: 'Emergency fund importance',
      suggestedAction: 'Create an emergency fund tracker',
    },
    {
      score: 25,
      focus: 'Income & Expenses',
      topic: 'Budget creation and tracking',
      suggestedAction: 'Complete your presupuesto module',
    },
    {
      score: 40,
      focus: 'Debt Management',
      topic: 'Credit utilization and optimization',
      suggestedAction: 'Use Debt Analyzer for your current debts',
    },
    {
      score: 55,
      focus: 'Investing Basics',
      topic: 'Introduction to mutual funds',
      suggestedAction: 'Explore fondos mutuales vs APV',
    },
    {
      score: 70,
      focus: 'Advanced Planning',
      topic: 'Retirement planning and APV',
      suggestedAction: 'Optimize your APV contributions',
    },
    {
      score: 85,
      focus: 'Portfolio Strategy',
      topic: 'Asset allocation and rebalancing',
      suggestedAction: 'Learn about hedge and risk management',
    },
  ];

  return recommendations
    .filter((r) => r.score > score)
    .slice(0, 3)
    .map((r) => ({
      focus: r.focus,
      topic: r.topic,
      suggestedAction: r.suggestedAction,
    }));
}

/**
 * Estimate knowledge score increase from user profile
 * Used to initialize knowledge based on intake questionnaire
 */
export function estimateBaseKnowledgeScore(profile: any): number {
  let score = 5; // Base score everyone gets

  // Education level
  if (profile?.intake?.selfRatedUnderstanding) {
    score += profile.intake.selfRatedUnderstanding * 6; // 0-60 points
  }

  // Financial products owned
  const productsCount = profile?.intake?.financialProducts?.length ?? 0;
  score += Math.min(productsCount * 3, 15); // 0-15 points

  // Financial knowledge checklist
  if (profile?.intake?.financialKnowledge) {
    const knownTopics = Object.values(profile.intake.financialKnowledge).filter(
      (v) => v === true
    ).length;
    score += Math.min(knownTopics * 2, 20); // 0-20 points
  }

  // Has savings/investments
  if (profile?.intake?.hasSavingsOrInvestments) {
    score += 5;
  }

  // Tracks expenses
  if (profile?.intake?.tracksExpenses === 'yes') {
    score += 5;
  }

  return Math.min(100, score);
}
