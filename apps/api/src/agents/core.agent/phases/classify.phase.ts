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
    const classificationRaw = await completeStructured({
      system: CORE_CLASSIFIER_SYSTEM,
      user: user_message,
      temperature: 0,
    });

    // Step 2: Validate with Zod schema
    const modeSchema = ReasoningModeSchema.safeParse(classificationRaw.mode);
    if (!modeSchema.success) {
      logger.warn({
        msg: '[Classify] Invalid mode from LLM, defaulting to information',
        provided: classificationRaw.mode,
      });
      classificationRaw.mode = 'information';
    }

    const classification: Classification = {
      mode: classificationRaw.mode,
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
      classificationRaw.requires_tools && /\b(pdf|reporte|informe)\b/i.test(user_message),
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
      error: err,
      latency_ms: Date.now() - startClassify,
    });
    throw err;
  }
}
