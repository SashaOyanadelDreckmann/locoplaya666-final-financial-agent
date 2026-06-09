/**
 * core-agent-orchestrator.ts
 *
 * Main orchestrator for the core agent runtime pipeline.
 * Runtime order:
 *   1) Classify
 *   2) Execute (ReAct tool loop)
 *   3) Format response
 *   4) Validate coherence
 *   5) Detect/record knowledge
 */

import type {
  ChatAgentInput,
  ChatAgentResponse,
} from './chat.types';
import { ChatAgentResponseSchema } from './chat.types';
import { randomUUID } from 'crypto';
import type { CoreAgentContext, RunCoreAgentOptions } from './agent-types';
import { runClassifyPhase } from './phases/classify.phase';
import { runPlanExecutePhase } from './phases/plan-execute.phase';
import { runFormatPhase, detectAndRecordKnowledge } from './phases/format.phase';
import { runValidatePhase } from './phases/validate.phase';
import { buildRecommendationProfile } from './helpers/recommendation-profile.helpers';
import { buildReferenceDateContext } from './helpers/evidence.helpers';
import { getLogger } from '../../logger';

function clamp01(value: unknown, fallback = 0): number {
  const raw = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(raw)) return fallback;
  if (raw > 1) return Math.max(0, Math.min(1, raw / 100));
  return Math.max(0, Math.min(1, raw));
}

// Maps each reasoning mode to its inherent regulatory/financial risk level.
// Lower = safe educational content; higher = direct advice or complex operations.
const MODE_RISK_SCORE: Record<string, number> = {
  education:       0.10,
  information:     0.15,
  budgeting:       0.25,
  comparison:      0.40,
  regulation:      0.45,
  simulation:      0.50,
  planification:   0.55,
  decision_support: 0.70,
  containment:     0.20,
};

/**
 * Main entry point: run all phases and return final response
 */
export async function runCoreAgent(
  input: ChatAgentInput,
  options?: RunCoreAgentOptions,
): Promise<ChatAgentResponse> {
  const logger = getLogger();
  const turn_id = randomUUID();
  const started_at = Date.now();
  const stream = options?.stream;

  // Extract injected context from input.context (set by route handler)
  const inputContext = input.context as Record<string, any> || {};
  const inputUiState = input.ui_state as Record<string, any> || {};
  const budgetSummary =
    inputUiState.budget_summary ||
    inputContext.injected_budget ||
    { income: 0, expenses: 0, balance: 0 };

  const ctx: CoreAgentContext = {
    input,
    turn_id,
    started_at,
    injected_profile: inputContext.injected_profile || null,
    injected_intake: inputContext.injected_intake || null,
    injected_budget: inputContext.injected_budget || { income: 0, expenses: 0, balance: 0 },
    injected_memory: inputContext.persistent_memory || inputContext.system_memory ? {
      persistent: inputContext.persistent_memory || [],
      system: inputContext.system_memory || [],
    } : undefined,
    injected_ui_state: {
      knowledge_score: inputUiState.knowledge_score,
      context_score: inputUiState.context_score,
    },
  };

  try {
    logger.info({
      msg: '[Agent] Starting',
      turn_id,
      user: input.user_id,
      mode: 'unknown', // Will be set after classify
    });

    stream?.emit({ type: 'run.start', turn_id, ts: Date.now() });

    // ────────────────────────────────────────────────
    // PHASE 1: CLASSIFY
    // ────────────────────────────────────────────────
    const classifyOutput = await runClassifyPhase({
      user_message: input.user_message,
      history: input.history,
      stream,
    });

    ctx.classification = classifyOutput.classification;
    ctx.inferred_user_model = classifyOutput.inferred_user_model;

    logger.info({
      msg: '[Agent] Classification complete',
      mode: classifyOutput.classification.mode,
      confidence: classifyOutput.classification.confidence,
    });

    const recommendationProfile = buildRecommendationProfile({
      activeChatId: inputUiState.active_chat?.id,
      budgetSummary,
      intake: ctx.injected_intake as Record<string, unknown> | null | undefined,
      inferredUserModel: classifyOutput.inferred_user_model,
      userMessage: input.user_message,
      turnCount:
        typeof inputUiState.product_turn_count === 'number'
          ? inputUiState.product_turn_count
          : undefined,
      turnsRemaining:
        typeof inputUiState.product_turns_remaining === 'number'
          ? inputUiState.product_turns_remaining
          : undefined,
      closingMode: inputUiState.product_closing_mode === true,
    });

    // Build context summary
    const context_summary = {
      ...buildReferenceDateContext(),
      profile: ctx.injected_profile,
      intake: ctx.injected_intake,
      budget: ctx.injected_budget,
      persistent_memory: ctx.injected_memory?.persistent || [],
      session_memory: inputContext.session_memory || null,
      realtime_memory: inputContext.realtime_memory || null,
      system_memory: ctx.injected_memory?.system || [],
      recent_artifacts: inputContext.recent_artifacts || [],
      recent_chart_summaries: inputContext.recent_chart_summaries || [],
      uploaded_documents: inputContext.uploaded_documents || [],
      uploaded_evidence_files: inputContext.uploaded_evidence_files || [],
      consolidated_context: inputContext.consolidated_context || {},
      product_lifecycle: inputContext.product_lifecycle || {},
      product_directive: inputContext.product_directive || '',
      market_snapshot: inputContext.market_snapshot || null,
      ui_state_snapshot: {
        active_chat: inputUiState.active_chat || null,
        budget_summary: inputUiState.budget_summary || null,
        milestone_details: inputUiState.milestone_details || [],
        flow_status: inputUiState.flow_status || null,
        product_turns_remaining: inputUiState.product_turns_remaining ?? null,
        product_closing_mode: inputUiState.product_closing_mode === true,
      },
      recommendation_profile: recommendationProfile,
    };

    // ────────────────────────────────────────────────
    // PHASE 2: EXECUTE (ReAct Loop)
    // ────────────────────────────────────────────────
    const executeOutput = await runPlanExecutePhase({
      classification: classifyOutput.classification,
      inferred_user_model: classifyOutput.inferred_user_model,
      context_summary,
      user_message: input.user_message,
      injected_profile: ctx.injected_profile,
      injected_intake: ctx.injected_intake,
      user_id: input.user_id,
      turn_id,
      stream,
    });

    ctx.execution_result = executeOutput.execution_result;

    logger.info({
      msg: '[Agent] Execution complete',
      tools_count: executeOutput.execution_result.tool_calls.length,
      iterations: executeOutput.execution_result.iterations_count,
    });

    // ────────────────────────────────────────────────
    // PHASE 3: FORMAT RESPONSE
    // ────────────────────────────────────────────────
    const formatOutput = await runFormatPhase({
      mode: classifyOutput.classification.mode,
      execution_result: executeOutput.execution_result,
      user_message: input.user_message,
      context_summary,
      ui_state: input.ui_state,
      inferred_user_model: classifyOutput.inferred_user_model,
      injected_profile: ctx.injected_profile,
      injected_intake: ctx.injected_intake,
      stream,
    });

    ctx.formatted_response = formatOutput.formatted_response;

    // ────────────────────────────────────────────────
    // PHASE 4: VALIDATE COHERENCE
    // ────────────────────────────────────────────────
    const validateOutput = await runValidatePhase({
      formatted_response: formatOutput.formatted_response,
      mode: classifyOutput.classification.mode,
      injected_profile: ctx.injected_profile,
      injected_intake: ctx.injected_intake,
      injected_budget: ctx.injected_budget,
      history: input.history,
      stream,
    });

    ctx.coherence_check = validateOutput.coherence_check;

    // Update message if coherence check modified it
    if (validateOutput.coherence_check.message_updated) {
      ctx.formatted_response.message = validateOutput.coherence_check.message_updated;
    }

    logger.info({
      msg: '[Agent] Coherence validation complete',
      score: validateOutput.coherence_check.score,
      isCoherent: validateOutput.coherence_check.isCoherent,
    });

    // ────────────────────────────────────────────────
    // PHASE 5: KNOWLEDGE DETECTION & RECORDING
    // ────────────────────────────────────────────────
    stream?.phase('knowledge', 'start');
    const knowledge = await detectAndRecordKnowledge({
      user_id: input.user_id,
      user_message: input.user_message,
      agent_response: ctx.formatted_response.message,
      tools_used: ctx.execution_result.tool_calls.map((tc) => tc.tool),
      mode: classifyOutput.classification.mode,
      previous_score: ctx.injected_ui_state?.knowledge_score || 0,
      user_profile: ctx.injected_profile,
    });
    stream?.phase('knowledge', 'done');

    // ────────────────────────────────────────────────
    // BUILD FINAL RESPONSE
    // ────────────────────────────────────────────────
    const latency_ms = Date.now() - started_at;

    const response: ChatAgentResponse = {
      message: ctx.formatted_response.message,
      mode: classifyOutput.classification.mode,
      tool_calls: ctx.execution_result.tool_calls,
      react: {
        objective: executeOutput.plan_objective || classifyOutput.classification.intent,
        steps: ctx.execution_result.react_trace.map((step) => ({
          step: step.iteration || 0,
          goal: step.decision || '',
          observation: step.result,
          decision: step.decision,
        })),
      },
      agent_blocks: ctx.formatted_response.agent_blocks,
      artifacts: ctx.formatted_response.artifacts,
      citations: ctx.formatted_response.citations,
      compliance: {
        mode: classifyOutput.classification.mode,
        no_auto_execution: true,
        includes_recommendation:
          classifyOutput.classification.mode === 'decision_support' ||
          classifyOutput.classification.mode === 'comparison' ||
          classifyOutput.classification.mode === 'planification' ||
          recommendationProfile.specialization === 'strategy',
        includes_simulation: classifyOutput.classification.mode === 'simulation',
        includes_regulation: classifyOutput.classification.mode === 'regulation',
        missing_information: recommendationProfile.missing_critical_data,
        disclaimers_shown: ['final_decision_user'],
        risk_score: MODE_RISK_SCORE[classifyOutput.classification.mode] ?? 0.30,
        blocked: { is_blocked: false },
      },
      state_updates: {
        inferred_user_model: classifyOutput.inferred_user_model,
        recommendation_profile: recommendationProfile,
        coherence_validation: ctx.coherence_check,
        technical_backend_message: ctx.formatted_response.technical_backend_message,
      },
      suggested_replies: ctx.formatted_response.suggested_replies ?? [],
      panel_action: ctx.formatted_response.panel_action ? {
        section: ctx.formatted_response.panel_action.section as 'budget' | 'transactions' | 'library' | 'recents' | 'profile' | 'news' | 'objective' | 'mode' | undefined,
        message: ctx.formatted_response.panel_action.message,
      } : undefined,
      budget_updates: ctx.formatted_response.budget_updates?.map((update) => ({
        label: update.label,
        type: update.type as 'income' | 'expense',
        amount: update.amount,
        category: update.category,
      })),
      knowledge_score: knowledge.knowledge_score,
      knowledge_event_detected: knowledge.knowledge_event_detected,
      milestone_unlocked: knowledge.milestone_unlocked,
      meta: {
        turn_id,
        latency_ms,
      },
    };

    // Validate against schema
    const validated = ChatAgentResponseSchema.safeParse(response);
    if (!validated.success) {
      logger.error({
        msg: '[Agent] Response validation failed',
        issues: validated.error.issues,
      });
      throw new Error(
        `Response validation failed: ${JSON.stringify(validated.error.issues)}`
      );
    }

    logger.info({
      msg: '[Agent] Complete',
      turn_id,
      mode: response.mode,
      latency_ms,
      suggested_replies: response.suggested_replies?.length ?? 0,
    });

    return validated.data;
  } catch (err) {
    logger.error({
      msg: '[Agent] Execution failed',
      turn_id,
      error: err,
      latency_ms: Date.now() - started_at,
    });
    throw err;
  }
}
