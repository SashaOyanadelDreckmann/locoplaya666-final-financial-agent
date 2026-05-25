/**
 * format.phase.ts
 *
 * PHASE 5: Format Response
 * Generate final response, parse special tags, detect knowledge events
 */

import { complete, completeWithClaude } from '../../../services/llm.service';
import { CORE_RESPONSE_SYSTEM } from '../system.prompts';
import { detectKnowledgeEvent } from '../knowledge-detector';
import { recordKnowledgeEvent, getMilestones, KNOWLEDGE_MILESTONES } from '../../../services/knowledge.service';
import {
  extractChartBlocksFromToolOutput,
  extractSuggestedReplies,
  extractPanelAction,
  extractBudgetUpdates,
  cleanSpecialTags,
  inferQuestionnaireFromText,
} from '../helpers/chart-extraction.helpers';
import { stripEmojis } from '../helpers/format.helpers';
import { sanitizeFormulaContent } from '../helpers/formula-sanitizer';
import type { FormatPhaseInput, FormatPhaseOutput, FormattedResponse } from '../agent-types';
import { getLogger } from '../../../logger';

function shouldApplyLatexFormatting(message: string): boolean {
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
  const artifacts = input.execution_result?.artifacts?.slice(0, 2) ?? [];
  const toolContext = compactToolOutputs(input);
  const productDirective =
    typeof input.context_summary?.product_directive === 'string'
      ? input.context_summary.product_directive
      : '';
  const recentThreadContext =
    typeof input.context_summary?.recent_thread_context === 'string' &&
    input.context_summary.recent_thread_context.length > 0
      ? input.context_summary.recent_thread_context
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
    recentThreadContext ? `Hilo reciente:\n${recentThreadContext}` : '',
    `Modo: ${input.mode}`,
    `Arquitectura del producto: ${productDirective || 'sin directiva especial'}`,
    `Herramientas usadas: ${toolsUsed.join(', ') || 'ninguna'}`,
    `Artefactos: ${artifacts.map((a) => a.title).join(' | ') || 'ninguno'}`,
    '',
    'Regla: no escribas fuentes ni citas dentro del cuerpo; la UI las mostrará aparte en el bloque de citas.',
    'Evidencia resumida:',
    toolContext,
  ].join('\n');

  const raw = await complete(prompt, {
    systemPrompt:
      'Eres un asesor financiero senior. Tu prioridad es claridad, utilidad inmediata, precision y coherencia con la arquitectura del producto.',
    temperature: 0.2,
    maxCompletionTokens: 520,
  });

  let cleaned = stripEmojis(cleanSpecialTags(raw)).trim();
  cleaned = sanitizeFormulaContent(cleaned);
  return cleaned.length > 0
    ? cleaned
    : 'Aquí va una lectura rápida: con la evidencia disponible, conviene confirmar contexto clave y ejecutar 2-3 pasos de control antes de decidir.';
}

export async function runFormatPhase(input: FormatPhaseInput): Promise<FormatPhaseOutput> {
  const logger = getLogger();
  const startTime = Date.now();
  const fastFormatEnabled = process.env.NODE_ENV !== 'test' && process.env.AGENT_FAST_FORMAT === 'true';

  try {
    if (fastFormatEnabled) {
      const message = await buildFastValuableMessage(input);

      const formatted_response: FormattedResponse = {
        message,
        agent_blocks: input.execution_result?.agent_blocks || [],
        artifacts: input.execution_result?.artifacts || [],
        citations: input.execution_result?.citations || [],
        suggested_replies: [],
        panel_action: undefined,
        context_score: undefined,
        budget_updates: [],
      };

      logger.info({ msg: '[Format] Fast format applied', latency_ms: Date.now() - startTime });
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

    const snowballCtx =
      typeof input.context_summary?.snowball_user_context === 'string' &&
      input.context_summary.snowball_user_context.length > 0
        ? input.context_summary.snowball_user_context
        : null;
    const recentThreadContext =
      typeof input.context_summary?.recent_thread_context === 'string' &&
      input.context_summary.recent_thread_context.length > 0
        ? input.context_summary.recent_thread_context
        : null;

    const formatterInput = [
      `Modo: ${input.mode}`,
      `Directiva de producto: ${
        typeof input.context_summary?.product_directive === 'string'
          ? input.context_summary.product_directive
          : 'sin directiva especial'
      }`,
      ...(snowballCtx ? [`\n${snowballCtx}\n`] : []),
      ...(recentThreadContext ? [`\n${recentThreadContext}\n`] : []),
      'Mensaje del usuario:',
      input.user_message,
      '',
      'Contexto de ejecucion (tools, outputs, artifacts, citations):',
      executionSummary,
      '',
      'Instruccion: responde en espanol, limpio, sin XML, sin tags de tools, y alineado a la evidencia.',
    ].join('\n');

    const rawResponse = await completeWithClaude(formatterInput, {
      systemPrompt: CORE_RESPONSE_SYSTEM,
      temperature: 0.4,
    });

    const suggested_replies = extractSuggestedReplies(rawResponse);
    const panel_action = extractPanelAction(rawResponse);
    const budget_updates = extractBudgetUpdates(rawResponse);
    const responseChartBlocks = extractChartBlocksFromToolOutput(rawResponse);

    let message = cleanSpecialTags(rawResponse);
    message = stripEmojis(message).trim();
    message = sanitizeFormulaContent(message);

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
        }
      } catch {
        // Continue with original message if LaTeX formatting fails
      }
    }

    const contextScoreMatch = rawResponse.match(/<CONTEXT_SCORE>(\d+)<\/CONTEXT_SCORE>/);
    const context_score = contextScoreMatch ? parseInt(contextScoreMatch[1], 10) : undefined;

    const hasQuestionnaireBlock = [...(input.execution_result?.agent_blocks || []), ...responseChartBlocks]
      .some((b) => b.type === 'questionnaire');
    const inferredQuestionnaire = !hasQuestionnaireBlock
      ? inferQuestionnaireFromText(message, {
          intake: input.injected_intake ?? input.context_summary?.intake,
          profile: input.injected_profile ?? input.context_summary?.profile,
          user_message: input.user_message,
        })
      : null;

    const formatted_response: FormattedResponse = {
      message,
      agent_blocks: [
        ...(input.execution_result?.agent_blocks || []),
        ...responseChartBlocks,
        ...(inferredQuestionnaire ? [inferredQuestionnaire] : []),
      ],
      artifacts: input.execution_result?.artifacts || [],
      citations: input.execution_result?.citations || [],
      suggested_replies,
      panel_action,
      context_score,
      budget_updates,
    };

    logger.info({
      msg: '[Format] Phase complete',
      has_suggestions: suggested_replies.length > 0,
      has_artifacts: formatted_response.artifacts.length > 0,
      latency_ms: Date.now() - startTime,
    });

    return { formatted_response };
  } catch (err) {
    logger.warn({ msg: '[Format] Phase failed, using safe fallback', error: err, latency_ms: Date.now() - startTime });

    let fallbackMessage =
      'Preparé una respuesta base con los resultados disponibles. Si quieres, la refinamos en el siguiente mensaje.';
    fallbackMessage = sanitizeFormulaContent(fallbackMessage);

    const formatted_response: FormattedResponse = {
      message: fallbackMessage,
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

      const milestones = getMilestones(newScore);
      const previousMilestones = getMilestones(params.previous_score);
      const newUnlocks = milestones.unlocked.filter((m) => !previousMilestones.unlocked.includes(m));

      if (newUnlocks.length > 0) {
        const unlockedFeature = newUnlocks[0];
        const unlockedMilestone = KNOWLEDGE_MILESTONES.find((m) => m.feature === unlockedFeature);

        logger.info({ msg: '[Knowledge] Milestone unlocked', user_id: params.user_id, milestone: unlockedMilestone, newScore });

        return {
          knowledge_event_detected: true,
          knowledge_score: newScore,
          milestone_unlocked: {
            threshold: unlockedMilestone?.threshold || 0,
            feature: unlockedFeature,
          },
        };
      }

      logger.info({ msg: '[Knowledge] Event recorded', user_id: params.user_id, action: detection.action, points, newScore });

      return { knowledge_event_detected: true, knowledge_score: newScore };
    }

    return { knowledge_event_detected: false, knowledge_score: params.previous_score };
  } catch (err) {
    logger.warn({ msg: '[Knowledge] Detection failed (non-blocking)', error: err });
    return { knowledge_event_detected: false, knowledge_score: params.previous_score };
  }
}
