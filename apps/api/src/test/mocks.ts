/**
 * mocks.ts
 *
 * Shared test utilities and mock factories
 * Used across all phase tests
 */

import type {
  ChatAgentInput,
  ReasoningMode,
} from '../agents/core.agent/chat.types';
import type {
  Classification,
  InferredUserModel,
  ExecutionResult,
  FormattedResponse,
  CoherenceCheckResult,
} from '../agents/core.agent/agent-types';
import type { BudgetSummary } from '../services/panel-state.service';
import type { FinancialDiagnosticProfile } from '../schemas/profile.schema';
import type { IntakeQuestionnaire } from '@financial-agent/shared/src/intake/intake-questionnaire.types';

// ─────────────────────────────────────────
// INPUT FIXTURES
// ─────────────────────────────────────────

export function createMockChatAgentInput(
  overrides?: Partial<ChatAgentInput>,
): ChatAgentInput {
  return {
    user_id: 'test-user-123',
    user_message: '¿Cuál es mi horizonte de inversión óptimo?',
    history: [],
    context: {
      injected_profile: null,
      injected_intake: null,
      injected_budget: { income: 0, expenses: 0, balance: 0 },
    },
    ...overrides,
  };
}

export function createMockProfile(
  overrides?: Partial<FinancialDiagnosticProfile>,
): FinancialDiagnosticProfile {
  return {
    version: 'v2',
    meta: {
      completeness: 0.85,
      blocksExplored: ['income', 'expenses', 'savings', 'investments', 'debt'],
      blocksSkipped: [],
      completedAt: new Date().toISOString(),
    },
    blocks: {},
    diagnosticNarrative: 'User has balanced financial profile with moderate savings',
    profile: {
      financialClarity: 'medium',
      decisionStyle: 'analytical',
      timeHorizon: 'long_term',
      financialPressure: 'low',
      emotionalPattern: 'neutral',
      coherenceScore: 0.85,
    },
    tensions: [],
    hypotheses: [],
    openQuestions: [],
    ...overrides,
  } as FinancialDiagnosticProfile;
}

export function createMockBudget(
  overrides?: Partial<BudgetSummary>,
): BudgetSummary {
  return {
    income: 5000,
    expenses: 3000,
    balance: 2000,
    ...overrides,
  };
}

// ─────────────────────────────────────────
// PHASE OUTPUT FIXTURES
// ─────────────────────────────────────────

export function createMockClassification(
  overrides?: Partial<Classification>,
): Classification {
  return {
    mode: 'decision_support' as ReasoningMode,
    intent: 'user wants investment advice',
    requires_tools: true,
    requires_rag: false,
    confidence: 0.92,
    ...overrides,
  };
}

export function createMockInferredUserModel(
  overrides?: Partial<InferredUserModel>,
): InferredUserModel {
  return {
    preferred_output: 'mixed',
    detail_level: 'standard',
    risk_profile: 'balanced',
    inferred_horizon_months: 120,
    inferred_monthly_contribution: 1000,
    inferred_principal: 50000,
    ...overrides,
  };
}

export function createMockExecutionResult(
  overrides?: Partial<ExecutionResult>,
): ExecutionResult {
  return {
    tool_calls: [],
    tool_outputs: [],
    artifacts: [],
    agent_blocks: [],
    citations: [],
    react_trace: [
      {
        iteration: 1,
        decision: 'User asking for investment advice',
        result: 'Proceeding with decision support mode',
      },
    ],
    iterations_count: 1,
    ...overrides,
  };
}

export function createMockFormattedResponse(
  overrides?: Partial<FormattedResponse>,
): FormattedResponse {
  return {
    message: 'Based on your profile, I recommend a balanced investment strategy.',
    agent_blocks: [],
    artifacts: [],
    citations: [],
    suggested_replies: ['¿Cuáles son los fondos que recomiendas?', 'Muéstrame la proyección'],
    context_score: 85,
    budget_updates: [],
    ...overrides,
  };
}

export function createMockCoherenceCheckResult(
  overrides?: Partial<CoherenceCheckResult>,
): CoherenceCheckResult {
  return {
    isCoherent: true,
    score: 0.92,
    warnings: [],
    suggestions: [],
    message_modified: false,
    ...overrides,
  };
}

// ─────────────────────────────────────────
// MOCK LLM RESPONSES
// ─────────────────────────────────────────

export function createMockClassifierResponse(mode: ReasoningMode = 'decision_support'): string {
  return JSON.stringify({
    mode,
    intent: 'user wants investment advice',
    requires_tools: true,
    requires_rag: false,
    confidence: 0.92,
  });
}

export function createMockFormatterResponse(): string {
  return `Based on your profile, I recommend a balanced investment strategy.

<SUGERENCIAS>
["¿Cuáles son los fondos que recomiendas?", "Muéstrame la proyección"]
</SUGERENCIAS>

<CONTEXT_SCORE>85</CONTEXT_SCORE>`;
}

// ─────────────────────────────────────────
// MOCK SERVICE FUNCTIONS
// ─────────────────────────────────────────

export function mockCompleteStructured(response: string) {
  return {
    safeParse: () => ({
      success: true,
      data: JSON.parse(response),
    }),
  };
}

export function mockComplete(response: string) {
  return Promise.resolve(response);
}

// ─────────────────────────────────────────
// MOCK TOOL CALLS
// ─────────────────────────────────────────

export function createMockToolCall(overrides?: any) {
  return {
    tool: 'market.expected_annual_return',
    input: { risk_profile: 'balanced' },
    ...overrides,
  };
}

export function createMockArtifact(overrides?: any) {
  return {
    id: 'artifact-123',
    type: 'chart',
    data: { chart_type: 'line', title: 'Investment Growth' },
    ...overrides,
  };
}

export function createMockCitation(overrides?: any) {
  return {
    source: 'CMF',
    title: 'Investment Guidelines',
    url: 'https://example.com',
    text: 'Balanced portfolios reduce volatility',
    ...overrides,
  };
}
