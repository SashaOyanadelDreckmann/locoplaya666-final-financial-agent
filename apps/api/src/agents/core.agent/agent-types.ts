/**
 * agent-types.ts
 *
 * CONSOLIDATED TYPES for Core Agent phases
 * Single source of truth for all data models flowing between phases
 */

import type {
  ChatAgentInput,
  ChatAgentResponse,
  ReasoningMode,
  ToolCall,
  Citation,
  AgentBlock,
  ChartBlock,
  TableBlock,
  Compliance,
  Artifact,
} from './chat.types';

import type { FinancialDiagnosticProfile } from '../../schemas/profile.schema';
import type { IntakeQuestionnaire } from '@financial-agent/shared/src/intake/intake-questionnaire.types';
import type { BudgetSummary } from '../../services/panel-state.service';

/**
 * PHASE 1: Classification Result
 * Output of classifier.phase.ts
 */
export interface Classification {
  mode: ReasoningMode;
  intent: string;
  requires_tools: boolean;
  requires_rag: boolean;
  confidence: number;
}

/**
 * PHASE 2: Execution Result (ReAct Loop)
 * Output of plan.phase.ts (note: includes execution)
 */
export interface ExecutionResult {
  tool_calls: ToolCall[];
  tool_outputs: Array<{ tool: string; data: any }>;
  artifacts: Artifact[];
  agent_blocks: AgentBlock[];
  citations: Citation[];
  react_trace: Array<{ iteration: number; decision: string; result: string }>;
  iterations_count: number;
}

/**
 * PHASE 5: Formatted Response (before validation)
 * Output of format.phase.ts
 */
export interface FormattedResponse {
  message: string;
  technical_backend_message?: string;
  agent_blocks: AgentBlock[];
  artifacts: Artifact[];
  citations: Citation[];
  suggested_replies: string[];
  panel_action?: { section?: string; message?: string };
  context_score?: number;
  budget_updates?: Array<{ label: string; type: string; amount: number; category: string }>;
  knowledge_event_detected?: boolean;
  knowledge_score?: number;
  milestone_unlocked?: { threshold: number; feature: string };
}

/**
 * PHASE 4: Coherence Validation Result
 * Output of validate.phase.ts
 */
export interface CoherenceCheckResult {
  isCoherent: boolean;
  score: number;
  warnings: string[];
  suggestions: string[];
  message_modified: boolean;
  message_updated?: string;
}

/**
 * User Model Inference
 * Inferred from message + profile in CLASSIFY phase
 */
export interface InferredUserModel {
  preferred_output: 'pdf' | 'charts' | 'mixed';
  detail_level: 'standard' | 'high';
  risk_profile: 'conservative' | 'balanced' | 'aggressive';
  inferred_horizon_months?: number;
  inferred_monthly_contribution?: number;
  inferred_principal?: number;
}

/**
 * Core Agent Context
 * Unified context passed between all phases
 * This is the single source of state flow
 */
export interface CoreAgentContext {
  // INPUT
  input: ChatAgentInput;

  // INJECTED CONTEXT (before classification)
  injected_profile: FinancialDiagnosticProfile | null;
  injected_intake: IntakeQuestionnaire | null;
  injected_budget: BudgetSummary;
  injected_memory?: {
    persistent: any[];
    system: any[];
  };
  injected_ui_state?: {
    knowledge_score?: number;
    context_score?: number;
  };

  // PHASE 1: CLASSIFY → outputs
  classification?: Classification;
  inferred_user_model?: InferredUserModel;

  // PHASE 2: PLAN (ReAct) → outputs
  execution_result?: ExecutionResult;

  // PHASE 5: FORMAT → outputs
  formatted_response?: FormattedResponse;

  // PHASE 4: VALIDATE → outputs
  coherence_check?: CoherenceCheckResult;

  // METADATA
  turn_id: string;
  started_at: number;
  finished_at?: number;
}

/**
 * Classifier Phase Input/Output
 */
export interface ClassifyPhaseInput {
  user_message: string;
  history?: Array<{ role: string; content: string }>;
}

export interface ClassifyPhaseOutput {
  classification: Classification;
  inferred_user_model: InferredUserModel;
  should_ask_format?: boolean;
}

/**
 * Plan/Execute Phase Input/Output
 */
export interface PlanPhaseInput {
  classification: Classification;
  inferred_user_model: InferredUserModel;
  context_summary: any;
  user_message?: string;
  injected_profile: FinancialDiagnosticProfile | null;
  injected_intake: IntakeQuestionnaire | null;
  user_id?: string;
  turn_id?: string;
}

export interface PlanPhaseOutput {
  execution_result: ExecutionResult;
  plan_objective?: string;
}

/**
 * Format Phase Input/Output
 */
export interface FormatPhaseInput {
  mode: ReasoningMode;
  execution_result: ExecutionResult;
  user_message: string;
  context_summary: any;
  ui_state?: any;
  inferred_user_model?: InferredUserModel;
  injected_profile?: FinancialDiagnosticProfile | null;
  injected_intake?: IntakeQuestionnaire | null;
}

export interface FormatPhaseOutput {
  formatted_response: FormattedResponse;
}

/**
 * Validate Phase Input/Output
 */
export interface ValidatePhaseInput {
  formatted_response: FormattedResponse;
  mode: ReasoningMode;
  injected_profile: FinancialDiagnosticProfile | null;
  injected_intake: IntakeQuestionnaire | null;
  injected_budget: BudgetSummary;
  history?: Array<{ role: string; content: string }>;
}

export interface ValidatePhaseOutput {
  coherence_check: CoherenceCheckResult;
}

/**
 * Final Response Builder Input
 */
export interface FinalResponseInput {
  classification: Classification;
  execution_result: ExecutionResult;
  formatted_response: FormattedResponse;
  coherence_check: CoherenceCheckResult;
  knowledge_event_detected?: boolean;
  knowledge_score?: number;
  milestone_unlocked?: { threshold: number; feature: string };
  turn_id: string;
  latency_ms: number;
}
