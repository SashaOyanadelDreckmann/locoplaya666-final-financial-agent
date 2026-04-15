/**
 * core-agent-orchestrator.ts
 *
 * Main orchestrator for the 5-phase core agent
 * Coordinates: Classify → Execute (Plan+Execute) → Format → Validate → Knowledge
 */

import type {
  ChatAgentInput,
  ChatAgentResponse,
} from './chat.types';
import { ChatAgentResponseSchema } from './chat.types';
import { randomUUID } from 'crypto';
import type { CoreAgentContext } from './agent-types';
import { runClassifyPhase } from './phases/classify.phase';
import { runPlanExecutePhase } from './phases/plan-execute.phase';
import { runFormatPhase, detectAndRecordKnowledge } from './phases/format.phase';
import { runValidatePhase } from './phases/validate.phase';
import { getLogger } from '../../logger';

/**
 * Main entry point: run all phases and return final response
 */
export async function runCoreAgent(input: ChatAgentInput): Promise<ChatAgentResponse> {
  const logger = getLogger();
  const turn_id = randomUUID();
  const started_at = Date.now();

  // Extract injected context from input.context (set by route handler)
  const inputContext = input.context as Record<string, any> || {};
  const inputUiState = input.ui_state as Record<string, any> || {};

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

    // ────────────────────────────────────────────────
    // PHASE 1: CLASSIFY
    // ────────────────────────────────────────────────
    const classifyOutput = await runClassifyPhase({
      user_message: input.user_message,
      history: input.history,
    });

    ctx.classification = classifyOutput.classification;
    ctx.inferred_user_model = classifyOutput.inferred_user_model;

    logger.info({
      msg: '[Agent] Classification complete',
      mode: classifyOutput.classification.mode,
      confidence: classifyOutput.classification.confidence,
    });

    // Build context summary
    const context_summary = {
      profile: ctx.injected_profile,
      intake: ctx.injected_intake,
      budget: ctx.injected_budget,
      persistent_memory: ctx.injected_memory?.persistent || [],
      system_memory: ctx.injected_memory?.system || [],
      recent_artifacts: inputContext.recent_artifacts || [],
      recent_chart_summaries: inputContext.recent_chart_summaries || [],
      uploaded_documents: inputContext.uploaded_documents || [],
      uploaded_evidence_files: inputContext.uploaded_evidence_files || [],
      consolidated_context: inputContext.consolidated_context || {},
    };

    // ────────────────────────────────────────────────
    // PHASE 2-3: PLAN + EXECUTE (ReAct Loop)
    // ────────────────────────────────────────────────
    const executeOutput = await runPlanExecutePhase({
      classification: classifyOutput.classification,
      inferred_user_model: classifyOutput.inferred_user_model,
      context_summary,
      injected_profile: ctx.injected_profile,
      injected_intake: ctx.injected_intake,
      user_id: input.user_id,
      turn_id,
    });

    ctx.execution_result = executeOutput.execution_result;

    logger.info({
      msg: '[Agent] Execution complete',
      tools_count: executeOutput.execution_result.tool_calls.length,
      iterations: executeOutput.execution_result.iterations_count,
    });

    // ────────────────────────────────────────────────
    // PHASE 5: FORMAT RESPONSE
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
    // KNOWLEDGE DETECTION & RECORDING
    // ────────────────────────────────────────────────
    const knowledge = await detectAndRecordKnowledge({
      user_id: input.user_id,
      user_message: input.user_message,
      agent_response: ctx.formatted_response.message,
      tools_used: ctx.execution_result.tool_calls.map((tc) => tc.tool),
      mode: classifyOutput.classification.mode,
      previous_score: ctx.injected_ui_state?.knowledge_score || 0,
      user_profile: ctx.injected_profile,
    });

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
        includes_recommendation: classifyOutput.classification.mode === 'decision_support',
        includes_simulation: classifyOutput.classification.mode === 'simulation',
        includes_regulation: classifyOutput.classification.mode === 'regulation',
        missing_information: [],
        disclaimers_shown: [],
        risk_score: classifyOutput.classification.confidence,
        blocked: { is_blocked: false },
      },
      state_updates: {
        inferred_user_model: classifyOutput.inferred_user_model,
        coherence_validation: ctx.coherence_check,
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
