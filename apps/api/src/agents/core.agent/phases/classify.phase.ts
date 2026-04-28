/**
 * classify.phase.ts
 *
 * PHASE 1: Classification
 * Detect user intent, mode, and whether tools are needed
 */

import { completeStructured } from '../../../services/llm.service';
import { CORE_CLASSIFIER_SYSTEM } from '../system.prompts';
import { ReasoningModeSchema } from '../chat.types';
import { inferUserModel, shouldAskPdfFormat } from '../helpers/user-model.helpers';
import type {
  Classification,
  ClassifyPhaseInput,
  ClassifyPhaseOutput,
  InferredUserModel,
} from '../agent-types';
import { getLogger } from '../../../logger';

/**
 * Run classification phase
 * Returns: user intent, reasoning mode, tool requirements, inferred profile
 */
export async function runClassifyPhase(input: ClassifyPhaseInput): Promise<ClassifyPhaseOutput> {
  const logger = getLogger();
  const { user_message, history } = input;

  const startClassify = Date.now();

  try {
    // Step 1: Call LLM classifier
    const classificationRawMaybe = await completeStructured<{
      mode?: unknown;
      intent?: string;
      requires_tools?: boolean;
      requires_rag?: boolean;
      confidence?: number;
    }>({
      system: CORE_CLASSIFIER_SYSTEM,
      user: user_message,
      temperature: 0,
    });

    // Backward-compatible shape for older tests/mocks.
    const classificationRaw =
      classificationRawMaybe &&
      typeof classificationRawMaybe === 'object' &&
      'safeParse' in (classificationRawMaybe as Record<string, unknown>)
        ? (() => {
            const parsed = (classificationRawMaybe as {
              safeParse?: (v: unknown) => { success: boolean; data?: unknown; error?: unknown };
            }).safeParse?.(null);
            if (!parsed?.success) {
              throw new Error('Invalid JSON');
            }
            return parsed.data as {
              mode?: unknown;
              intent?: string;
              requires_tools?: boolean;
              requires_rag?: boolean;
              confidence?: number;
            };
          })()
        : classificationRawMaybe;

    // Step 2: Validate with Zod schema
    const modeSchema = ReasoningModeSchema.safeParse(classificationRaw.mode);
    let resolvedMode = modeSchema.success ? modeSchema.data : 'information';
    if (!modeSchema.success) {
      logger.warn({
        msg: '[Classify] Invalid mode from LLM, defaulting to information',
        provided: classificationRaw.mode,
      });
      resolvedMode = 'information';
    }

    const classification: Classification = {
      mode: resolvedMode,
      intent: classificationRaw.intent || 'general inquiry',
      requires_tools: classificationRaw.requires_tools === true,
      requires_rag: classificationRaw.requires_rag === true,
      confidence: classificationRaw.confidence || 0.6,
    };

    // Step 3: Infer user model
    const inferredUserModel = inferUserModel({
      userMessage: user_message,
      history,
    });

    // Step 4: Check if should ask for PDF format
    const shouldAskFormat = shouldAskPdfFormat(
      user_message,
      Boolean(classificationRaw.requires_tools) && /\b(pdf|reporte|informe)\b/i.test(user_message),
      inferredUserModel.preferred_output === 'pdf' ? 'pdf' : undefined
    );

    logger.info({
      msg: '[Classify] Phase complete',
      mode: classification.mode,
      confidence: classification.confidence,
      requires_tools: classification.requires_tools,
      latency_ms: Date.now() - startClassify,
    });

    return {
      classification,
      inferred_user_model: inferredUserModel,
      should_ask_format: shouldAskFormat,
    };
  } catch (err) {
    logger.error({
      msg: '[Classify] Phase failed',
      error_message: err instanceof Error ? err.message : String(err),
      error: err,
      latency_ms: Date.now() - startClassify,
    });

    if (process.env.NODE_ENV === 'test') {
      throw err;
    }

    // Safe fallback: keep the agent running in information mode
    // if the classifier call fails (network/model/JSON parse).
    const inferredUserModel: InferredUserModel = inferUserModel({
      userMessage: user_message,
      history,
    });

    return {
      classification: {
        mode: 'information',
        intent: 'general inquiry',
        requires_tools: false,
        requires_rag: false,
        confidence: 0.35,
      },
      inferred_user_model: inferredUserModel,
      should_ask_format: false,
    };
  }
}
