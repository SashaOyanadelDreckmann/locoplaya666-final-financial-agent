/**
 * validate.phase.ts
 *
 * PHASE 4: Coherence Validation
 * Validate response against user profile, budget, and constraints
 */

import { resolveActionPlanFunnelStage } from '@financial-agent/shared';
import { validateAgentDecision } from '../coherence-validator';
import type {
  ValidatePhaseInput,
  ValidatePhaseOutput,
  CoherenceCheckResult,
} from '../agent-types';
import { getLogger } from '../../../logger';

/**
 * Validate coherence of response against user profile
 */
export async function runValidatePhase(input: ValidatePhaseInput): Promise<ValidatePhaseOutput> {
  const logger = getLogger();
  const startTime = Date.now();

  try {
    input.stream?.phase('validate', 'start');
    const hasBudgetUpdates =
      Array.isArray(input.formatted_response.budget_updates) &&
      input.formatted_response.budget_updates.length > 0;
    const activeChatId = String(
      (input.ui_state?.active_chat as { id?: string } | undefined)?.id ?? '',
    );
    const chat3Philosophical =
      activeChatId === 'chat-3' &&
      !/\b(n[uú]mero|tasa|cmf|sii|simular|calcular|cu[aá]nto|rentabilidad|inversi[oó]n|marco regulatorio|normativa)\b/i.test(
        String(input.user_message ?? ''),
      );
    const chat2DeliverStage =
      activeChatId === 'chat-2' &&
      resolveActionPlanFunnelStage({
        activeChatId: 'chat-2',
        turnCount:
          typeof input.ui_state?.product_turn_count === 'number'
            ? input.ui_state.product_turn_count
            : undefined,
        closingMode: input.ui_state?.product_closing_mode === true,
        userMessage: input.user_message,
      }) === 'deliver';

    const shouldValidate =
      !chat3Philosophical &&
      ([
        'decision_support',
        'planification',
        'simulation',
        'budgeting',
        'comparison',
        'regulation',
      ].includes(input.mode) ||
        hasBudgetUpdates ||
        chat2DeliverStage);

    if (!shouldValidate) {
      const coherence_check: CoherenceCheckResult = {
        isCoherent: true,
        score: 1.0,
        warnings: [],
        suggestions: [],
        message_modified: false,
      };

      logger.info({
        msg: '[Validate] Skipped (mode not requiring validation)',
        mode: input.mode,
      });

      return { coherence_check };
    }
    const validation = validateAgentDecision(input.formatted_response.message, {
      profile: input.injected_profile,
      intake: input.injected_intake,
      budget: input.injected_budget,
      history: input.history || [],
    });

    let message_updated: string | undefined;

    // If incoherent, prepend warning
    if (!validation.isCoherent) {
      const warningText = `⚠️ Advertencia de coherencia: esta respuesta tiene baja coherencia (${Math.round(
        validation.score * 100
      )}%) con tu perfil. ${validation.warnings.slice(0, 2).join(' ')}`;

      message_updated = `${warningText}\n\n${input.formatted_response.message}`;

      // Don't auto-execute budget updates if incoherent
      input.formatted_response.budget_updates = [];

      logger.warn({
        msg: '[Validate] Incoherent response detected',
        score: validation.score,
        warnings: validation.warnings,
      });
    }

    const coherence_check: CoherenceCheckResult = {
      isCoherent: validation.isCoherent,
      score: validation.score,
      warnings: validation.warnings,
      suggestions: validation.suggestions,
      message_modified: !!message_updated,
      message_updated,
    };

    logger.info({
      msg: '[Validate] Phase complete',
      score: validation.score,
      latency_ms: Date.now() - startTime,
    });

    return { coherence_check };
  } catch (err) {
    logger.warn({
      msg: '[Validate] Phase failed (non-blocking)',
      error: err,
    });

    const coherence_check: CoherenceCheckResult = {
      isCoherent: true,
      score: 0.8,
      warnings: ['Validation check skipped due to error'],
      suggestions: [],
      message_modified: false,
    };

    return { coherence_check };
  } finally {
    input.stream?.phase('validate', 'done');
  }
}
