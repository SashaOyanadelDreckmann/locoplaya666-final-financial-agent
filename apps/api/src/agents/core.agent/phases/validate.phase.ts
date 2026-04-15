/**
 * validate.phase.ts
 *
 * PHASE 4: Coherence Validation
 * Validate response against user profile, budget, and constraints
 */

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
    // Determine if validation is needed for this mode
    const shouldValidate =
      [
        'decision_support',
        'planification',
        'simulation',
        'budgeting',
        'comparison',
      ].includes(input.mode) ||
      (input.formatted_response.budget_updates &&
        input.formatted_response.budget_updates.length > 0);

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

    // Run coherence validation
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

    // Return passing validation if check fails
    const coherence_check: CoherenceCheckResult = {
      isCoherent: true,
      score: 0.8,
      warnings: ['Validation check skipped due to error'],
      suggestions: [],
      message_modified: false,
    };

    return { coherence_check };
  }
}
