/**
 * format.phase.ts
 *
 * PHASE 5: Format Response
 * Generate final response, parse special tags, detect knowledge events
 */

import { complete, completeStructured, completeWithClaude } from '../../../services/llm.service';
import { CORE_RESPONSE_SYSTEM } from '../system.prompts';
import { detectKnowledgeEvent } from '../knowledge-detector';
import { recordKnowledgeEvent, getMilestones, KNOWLEDGE_MILESTONES } from '../../../services/knowledge.service';
import {
  extractChartBlocksFromToolOutput,
  extractSuggestedReplies,
  extractPanelAction,
  cleanSpecialTags,
  inferQuestionnaireFromText,
} from '../helpers/chart-extraction.helpers';
import { stripEmojis } from '../helpers/format.helpers';
import type { FormatPhaseInput, FormatPhaseOutput, FormattedResponse } from '../agent-types';
import { getLogger } from '../../../logger';
import type { QuestionnaireBlock } from '../chat.types';

function isTechnicalBackendMode(): boolean {
  return process.env.AGENT_BACKEND_TECHNICAL_MODE !== 'false';
}

function isAnthropicUserTranslatorEnabled(): boolean {
  return process.env.AGENT_ENABLE_USER_TRANSLATOR !== 'false';
}

function shouldKeepRichChatMessage(input: FormatPhaseInput): boolean {
  const hasArtifacts = (input.execution_result?.artifacts?.length ?? 0) > 0;
  const hasBlocks = (input.execution_result?.agent_blocks?.length ?? 0) > 0;
  const hasCitations = (input.execution_result?.citations?.length ?? 0) > 0;
  return hasArtifacts || hasBlocks || hasCitations;
}

function estimateUserCommunicationLevel(input: FormatPhaseInput): 'beginner' | 'intermediate' | 'advanced' {
  const intake = (input.injected_intake ?? input.context_summary?.intake ?? {}) as Record<string, unknown>;
  const selfRated = Number(intake.selfRatedUnderstanding ?? NaN);
  if (Number.isFinite(selfRated)) {
    if (selfRated <= 3) return 'beginner';
    if (selfRated <= 6) return 'intermediate';
    return 'advanced';
  }
  return 'intermediate';
}

async function buildTechnicalBackendMessage(input: FormatPhaseInput): Promise<string> {
  const toolsUsed = input.execution_result?.tool_calls?.map((tc) => tc.tool).slice(0, 8) ?? [];
  const prompt = [
    'Genera una respuesta técnica de backend para un frontend-agent.',
    'Estilo: ingeniería de software/arquitectura, preciso, accionable, sin relleno.',
    'Incluye: diagnóstico, supuestos, cálculos/resultados, riesgos y próximos pasos.',
    'No hables como asistente generalista.',
    '',
    `Modo: ${input.mode}`,
    `User request: ${input.user_message}`,
    `Tools: ${toolsUsed.join(', ') || 'none'}`,
    `Tool outputs: ${compactToolOutputs(input)}`,
  ].join('\n');

  const technical = await complete(prompt, {
    systemPrompt:
      'Eres un backend financial reasoning engine optimizado para gpt-5.1-codex. Respondes como un ingeniero senior.',
    temperature: 0.1,
    model: process.env.OPENAI_MODEL || 'gpt-5.1-codex',
    maxCompletionTokens: 700,
  });

  return stripEmojis(cleanSpecialTags(technical)).trim();
}

async function translateTechnicalToUserMessage(params: {
  technicalMessage: string;
  input: FormatPhaseInput;
}): Promise<string> {
  const level = estimateUserCommunicationLevel(params.input);
  const model = process.env.AGENT_USER_TRANSLATOR_MODEL || process.env.ANTHROPIC_MODEL;
  const translated = await completeWithClaude(
    [
      'Traduce la siguiente respuesta técnica a lenguaje claro para usuario final chileno.',
      'Mantén precisión financiera. No inventes datos.',
      `Nivel objetivo: ${level}.`,
      'Formato: 1 resumen directo + 2 a 4 pasos concretos.',
      '',
      params.technicalMessage,
    ].join('\n'),
    {
      systemPrompt:
        'Eres un frontend-agent ultra optimizado para explicar finanzas en español chileno de forma clara y accionable.',
      temperature: 0.3,
      model,
      maxCompletionTokens: 650,
    },
  );

  const cleaned = stripEmojis(cleanSpecialTags(translated)).trim();
  return cleaned.length > 0 ? cleaned : params.technicalMessage;
}

function shouldApplyLatexFormatting(message: string): boolean {
  // Fast-path: avoid expensive formatting for short/plain responses.
  if (!message || message.length < 120) return false;
  const hasMathLikeContent =
    /\$[^$]+\$/.test(message) ||
    /\\(frac|sum|int|sqrt|cdot|times|left|right|begin|end)/.test(message) ||
    /\b(VF|VA|APV|CAE|UF|TPM)\b/i.test(message) ||
    /(?:\d+\s*[%]|=\s*[^=\n]+)/.test(message);
  return hasMathLikeContent;
}

function compactToolOutputs(input: FormatPhaseInput): string {
  const outputs = input.execution_result?.tool_outputs ?? [];
  if (outputs.length === 0) return 'Sin tool_outputs.';

  return outputs
    .slice(-3)
    .map((entry, idx) => {
      const raw =
        typeof entry?.data === 'string'
          ? entry.data
          : JSON.stringify(entry?.data ?? {}, null, 2);
      const trimmed = String(raw).replace(/\s+/g, ' ').trim().slice(0, 800);
      return `#${idx + 1} tool=${entry?.tool ?? 'unknown'} output=${trimmed}`;
    })
    .join('\n');
}

async function buildFastValuableMessage(input: FormatPhaseInput): Promise<string> {
  const toolsUsed = input.execution_result?.tool_calls?.map((tc) => tc.tool).slice(0, 4) ?? [];
  const citations = input.execution_result?.citations?.slice(0, 5) ?? [];
  const artifacts = input.execution_result?.artifacts?.slice(0, 2) ?? [];
  const toolContext = compactToolOutputs(input);
  const productDirective =
    typeof input.context_summary?.product_directive === 'string'
      ? input.context_summary.product_directive
      : '';

  const prompt = [
    'Responde en español (Chile), breve y útil.',
    'Entrega valor real al usuario en formato:',
    '1) respuesta directa (2-4 líneas),',
    '2) 2-3 acciones concretas inmediatas,',
    '3) una advertencia o supuesto importante si aplica.',
    'No menciones nombres de tools, pipeline interno ni tecnicismos de backend.',
    '',
    `Pregunta del usuario: ${input.user_message}`,
    `Modo: ${input.mode}`,
    `Arquitectura del producto: ${productDirective || 'sin directiva especial'}`,
    `Herramientas usadas: ${toolsUsed.join(', ') || 'ninguna'}`,
    `Artefactos: ${artifacts.map((a) => a.title).join(' | ') || 'ninguno'}`,
    `Fuentes: ${citations.map((c) => c.doc_title || c.source || '').filter(Boolean).join(' | ') || 'ninguna'}`,
    '',
    'Evidencia resumida:',
    toolContext,
  ].join('\n');

  const raw = await complete(prompt, {
    systemPrompt:
      'Eres un asesor financiero senior. Tu prioridad es claridad, utilidad inmediata, precision y coherencia con la arquitectura del producto.',
    temperature: 0.2,
    maxCompletionTokens: 520,
  });

  const cleaned = stripEmojis(cleanSpecialTags(raw)).trim();
  return cleaned.length > 0
    ? cleaned
    : 'Aquí va una lectura rápida: con la evidencia disponible, conviene confirmar contexto clave y ejecutar 2-3 pasos de control antes de decidir.';
}

/**
 * Format response from raw LLM output
 */
export async function runFormatPhase(input: FormatPhaseInput): Promise<FormatPhaseOutput> {
  const logger = getLogger();
  const startTime = Date.now();
  const fastFormatEnabled = process.env.AGENT_FAST_FORMAT === 'true';

  try {
    if (fastFormatEnabled) {
      const technicalMessage = isTechnicalBackendMode()
        ? await buildTechnicalBackendMessage(input)
        : await buildFastValuableMessage(input);
      const richChatMode = shouldKeepRichChatMessage(input);
      const message =
        isTechnicalBackendMode() && isAnthropicUserTranslatorEnabled() && !richChatMode
          ? await translateTechnicalToUserMessage({ technicalMessage, input })
          : technicalMessage;

      const formatted_response: FormattedResponse = {
        message,
        technical_backend_message: technicalMessage,
        agent_blocks: input.execution_result?.agent_blocks || [],
        artifacts: input.execution_result?.artifacts || [],
        citations: input.execution_result?.citations || [],
        suggested_replies: [],
        panel_action: undefined,
        context_score: undefined,
        budget_updates: [],
      };

      logger.info({
        msg: '[Format] Fast format applied',
        latency_ms: Date.now() - startTime,
      });

      return { formatted_response };
    }

    const executionSummary = JSON.stringify(
      {
        mode: input.mode,
        tool_calls: input.execution_result?.tool_calls?.map((tc) => ({
          tool: tc.tool,
          status: tc.status,
        })) ?? [],
        tool_outputs: input.execution_result?.tool_outputs?.slice(-4) ?? [],
        artifacts: input.execution_result?.artifacts?.map((a) => ({
          id: a.id,
          type: a.type,
          title: a.title,
          fileUrl: a.fileUrl,
        })) ?? [],
        citations: input.execution_result?.citations?.slice(0, 6) ?? [],
      },
      null,
      2
    );

    const formatterInput = [
      `Modo: ${input.mode}`,
      `Directiva de producto: ${
        typeof input.context_summary?.product_directive === 'string'
          ? input.context_summary.product_directive
          : 'sin directiva especial'
      }`,
      'Mensaje del usuario:',
      input.user_message,
      '',
      'Contexto de ejecucion (tools, outputs, artifacts, citations):',
      executionSummary,
      '',
      'Instruccion: responde en espanol, limpio, sin XML, sin tags de tools, y alineado a la evidencia.',
    ].join('\n');

    // Call LLM to format response
    const rawResponse = await completeWithClaude(formatterInput, {
      systemPrompt: CORE_RESPONSE_SYSTEM,
      temperature: 0.4,
    });

    // Parse special tags
    const suggested_replies = extractSuggestedReplies(rawResponse);
    const panel_action = extractPanelAction(rawResponse);
    const responseChartBlocks = extractChartBlocksFromToolOutput(rawResponse);

    // Clean message
    let message = cleanSpecialTags(rawResponse);
    message = stripEmojis(message).trim();

    // Auto-process only in non-fast mode due to CPU cost.
    if (shouldApplyLatexFormatting(message)) {
      try {
        const { formatLatexTool } = await import('../../../mcp/tools/latex/formatLatex.tool');
        const formatResult = await formatLatexTool.run({
          content: message,
          mode: 'auto',
          includeVariables: true,
        });

        if (formatResult.data?.formattedContent) {
          message = formatResult.data.formattedContent;
          logger.info({
            msg: '[Format] LaTeX formatting applied to response',
            originalLength: cleanSpecialTags(rawResponse).length,
            formattedLength: message.length,
            variablesExtracted: formatResult.data.processingStats?.variablesExtracted || 0,
          });
        } else {
          logger.info({
            msg: '[Format] LaTeX formatting returned no content, using original',
          });
        }
      } catch (formatError) {
        logger.warn({
          msg: '[Format] LaTeX formatting failed, using original response',
          error: formatError instanceof Error ? formatError.message : String(formatError),
        });
        // Continue with original message if formatting fails
      }
    }

    // Extract context score
    const contextScoreMatch = rawResponse.match(/<CONTEXT_SCORE>(\d+)<\/CONTEXT_SCORE>/);
    const context_score = contextScoreMatch ? parseInt(contextScoreMatch[1], 10) : undefined;

    const hasQuestionnaireBlock = [...(input.execution_result?.agent_blocks || []), ...responseChartBlocks]
      .some((b) => b.type === 'questionnaire');
    const inferredQuestionnaire =
      !hasQuestionnaireBlock
        ? inferQuestionnaireFromText(message, {
            intake: input.injected_intake ?? input.context_summary?.intake,
            profile: input.injected_profile ?? input.context_summary?.profile,
            user_message: input.user_message,
          })
        : null;

    const llmTunedQuestionnaire = inferredQuestionnaire
      ? await enrichQuestionnaireWithLLM(inferredQuestionnaire, {
          user_message: input.user_message,
          intake: input.injected_intake ?? input.context_summary?.intake,
          profile: input.injected_profile ?? input.context_summary?.profile,
          mode: input.mode,
        })
      : null;

    const technicalMessage = isTechnicalBackendMode()
      ? await buildTechnicalBackendMessage(input)
      : message;
    const richChatMode = shouldKeepRichChatMessage(input);
    const finalMessage =
      isTechnicalBackendMode() && isAnthropicUserTranslatorEnabled() && !richChatMode
        ? await translateTechnicalToUserMessage({ technicalMessage, input })
        : message;

    // Build formatted response
    const formatted_response: FormattedResponse = {
      message: finalMessage,
      technical_backend_message: technicalMessage,
      agent_blocks: [
        ...(input.execution_result?.agent_blocks || []),
        ...responseChartBlocks,
        ...(llmTunedQuestionnaire ? [llmTunedQuestionnaire] : []),
      ],
      artifacts: input.execution_result?.artifacts || [],
      citations: input.execution_result?.citations || [],
      suggested_replies,
      panel_action,
      context_score,
      budget_updates: [],
    };

    logger.info({
      msg: '[Format] Phase complete',
      has_suggestions: suggested_replies.length > 0,
      has_artifacts: formatted_response.artifacts.length > 0,
      latency_ms: Date.now() - startTime,
    });

    return { formatted_response };
  } catch (err) {
    logger.warn({
      msg: '[Format] Phase failed, using safe fallback',
      error: err,
      latency_ms: Date.now() - startTime,
    });

    const fallbackMessage =
      'Preparé una respuesta base con los resultados disponibles. Si quieres, la refinamos en el siguiente mensaje.';

    const formatted_response: FormattedResponse = {
      message: fallbackMessage,
      technical_backend_message: fallbackMessage,
      agent_blocks: input.execution_result?.agent_blocks || [],
      artifacts: input.execution_result?.artifacts || [],
      citations: input.execution_result?.citations || [],
      suggested_replies: [],
      panel_action: undefined,
      context_score: undefined,
      budget_updates: [],
    };

    return { formatted_response };
  }
}

async function enrichQuestionnaireWithLLM(
  block: QuestionnaireBlock,
  context: {
    user_message: string;
    intake?: unknown;
    profile?: unknown;
    mode?: string;
  }
): Promise<QuestionnaireBlock> {
  try {
    const payload = {
      user_message: context.user_message,
      mode: context.mode,
      intake: context.intake ?? {},
      profile: context.profile ?? {},
      questions: block.questionnaire.questions.map((q) => ({
        id: q.id,
        question: q.question,
        current_choices: q.choices,
      })),
    };

    const tuning = await completeStructured<{
      questions: Array<{ id: string; choices: string[] }>;
    }>({
      system:
        'Genera opciones de respuesta cortas y concretas para cuestionarios financieros en español chileno. Deben ser específicas al contexto del usuario, no genéricas.',
      user: [
        'Devuelve JSON válido con forma: {"questions":[{"id":"...","choices":["...","...","...","..."]}]}',
        'Reglas:',
        '- 4 opciones por pregunta.',
        '- Máximo 56 caracteres por opción.',
        '- Deben ser coherentes con la pregunta exacta y el contexto.',
        '- Evita opciones vacías o ambiguas.',
        '- No uses formato markdown.',
        '',
        JSON.stringify(payload),
      ].join('\n'),
      temperature: 0.2,
    });

    const byId = new Map(
      (tuning.questions ?? []).map((q) => [q.id, (q.choices ?? []).map((c) => String(c).trim()).filter(Boolean).slice(0, 4)])
    );

    const questions = block.questionnaire.questions.map((q) => {
      const llmChoices = byId.get(q.id) ?? [];
      const merged = Array.from(new Set([...(llmChoices || []), ...(q.choices || [])]))
        .filter(Boolean)
        .slice(0, 4);
      return {
        ...q,
        choices: merged.length > 0 ? merged : q.choices,
      };
    });

    return {
      ...block,
      questionnaire: {
        ...block.questionnaire,
        questions,
      },
    };
  } catch {
    return block;
  }
}

/**
 * Detect knowledge events and record milestone unlocks
 */
export async function detectAndRecordKnowledge(params: {
  user_id?: string;
  user_message: string;
  agent_response: string;
  tools_used: string[];
  mode: string;
  previous_score: number;
  user_profile?: any;
}): Promise<{
  knowledge_event_detected: boolean;
  knowledge_score: number;
  milestone_unlocked?: { threshold: number; feature: string };
}> {
  const logger = getLogger();

  try {
    const detection = detectKnowledgeEvent({
      userMessage: params.user_message,
      agentResponse: params.agent_response,
      toolsUsed: params.tools_used,
      mode: params.mode,
      previousScore: params.previous_score,
      userProfile: params.user_profile,
    });

    if (detection.detected && params.user_id) {
      const { newScore, points } = await recordKnowledgeEvent(
        params.user_id,
        detection.action!,
        detection.rationale,
        {
          confidence: detection.confidence,
          tools_used: params.tools_used,
          mode: params.mode,
        }
      );

      // Check for milestone unlocks
      const milestones = getMilestones(newScore);
      const previousMilestones = getMilestones(params.previous_score);

      const newUnlocks = milestones.unlocked.filter(
        (m) => !previousMilestones.unlocked.includes(m)
      );

      if (newUnlocks.length > 0) {
        const unlockedFeature = newUnlocks[0];
        const unlockedMilestone = KNOWLEDGE_MILESTONES.find(
          (m) => m.feature === unlockedFeature
        );

        logger.info({
          msg: '[Knowledge] Milestone unlocked',
          user_id: params.user_id,
          milestone: unlockedMilestone,
          newScore,
        });

        return {
          knowledge_event_detected: true,
          knowledge_score: newScore,
          milestone_unlocked: {
            threshold: unlockedMilestone?.threshold || 0,
            feature: unlockedFeature,
          },
        };
      }

      logger.info({
        msg: '[Knowledge] Event recorded',
        user_id: params.user_id,
        action: detection.action,
        points,
        newScore,
      });

      return {
        knowledge_event_detected: true,
        knowledge_score: newScore,
      };
    }

    return {
      knowledge_event_detected: false,
      knowledge_score: params.previous_score,
    };
  } catch (err) {
    logger.warn({
      msg: '[Knowledge] Detection failed (non-blocking)',
      error: err,
    });

    return {
      knowledge_event_detected: false,
      knowledge_score: params.previous_score,
    };
  }
}
