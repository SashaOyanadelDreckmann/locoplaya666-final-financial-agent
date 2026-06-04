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
import type { Citation } from '../chat.types';
import { retrieveRAGContext } from '../../../services/rag.service';
import { getLogger } from '../../../logger';
import {
  buildActionPlanFormatInstructions,
  enforceDeliverPlanStructure,
  resolveActionPlanFunnelStage,
  type ActionPlanFunnelStage,
} from '../helpers/action-plan-funnel.helpers';

function shouldApplyLatexFormatting(message: string): boolean {
  if (!message || message.length < 120) return false;
  const hasMathLikeContent =
    /\$[^$]+\$/.test(message) ||
    /\\(frac|sum|int|sqrt|cdot|times|left|right|begin|end)/.test(message) ||
    /\b(VF|VA|APV|CAE|UF|TPM)\b/i.test(message) ||
    /(?:\d+\s*[%]|=\s*[^=\n]+)/.test(message);
  return hasMathLikeContent;
}

function citationLabel(citation: Citation): string {
  return (
    citation.doc_title ||
    citation.source ||
    citation.url ||
    citation.doc_id ||
    'Fuente sin titulo'
  );
}

function appendSourcesBlock(message: string, citations: Citation[]): string {
  const cleanMessage = message.trim();
  const hasSourcesHeading = /\n#{0,3}\s*fuentes\b/i.test(cleanMessage);
  if (hasSourcesHeading) return cleanMessage;

  const scored = citations.map((citation, idx) => ({
    citation,
    idx,
    score:
      (citation.confidence ?? 0.5) +
      (citation.url ? 0.1 : 0) +
      ((citation.supporting_span?.length ?? 0) > 24 ? 0.05 : 0),
  }));
  scored.sort((a, b) => b.score - a.score || a.idx - b.idx);

  const uniqueLabels: string[] = [];
  for (const item of scored) {
    const citation = item.citation;
    const label = citationLabel(citation).trim();
    if (!label) continue;
    if (!uniqueLabels.includes(label)) uniqueLabels.push(label);
    if (uniqueLabels.length >= 6) break;
  }

  const renderedSources =
    uniqueLabels.length > 0
      ? uniqueLabels.map((label) => `- ${label}`).join('\n')
      : '- Base regulatoria interna (CMF / Ley 21.521 / glosario financiero)';

  return `${cleanMessage}\n\nFuentes:\n${renderedSources}`;
}

async function ensureMinimumCitations(input: FormatPhaseInput): Promise<Citation[]> {
  const existing = input.execution_result?.citations ?? [];
  if (existing.length > 0) return existing;

  try {
    const fallback = await retrieveRAGContext(
      `${input.user_message} CMF Ley 21.521 glosario financiero`,
      { mode: input.mode, intent: input.user_message },
    );
    return fallback;
  } catch {
    return existing;
  }
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

function shouldEnforceDecisionDisclaimer(input: FormatPhaseInput): boolean {
  const activeChatId = String(input.ui_state?.active_chat?.id ?? '');
  return (
    activeChatId === 'chat-2' ||
    input.mode === 'decision_support' ||
    input.mode === 'comparison' ||
    input.mode === 'planification'
  );
}

function resolveFormatFunnelStage(input: FormatPhaseInput): ActionPlanFunnelStage | null {
  const profile = input.context_summary?.recommendation_profile as
    | { action_plan_funnel_stage?: ActionPlanFunnelStage | null }
    | undefined;
  if (profile?.action_plan_funnel_stage) return profile.action_plan_funnel_stage;

  const ui = input.ui_state ?? {};
  return resolveActionPlanFunnelStage({
    activeChatId: (ui.active_chat as { id?: string } | undefined)?.id ?? ui.active_chat,
    turnCount: typeof ui.product_turn_count === 'number' ? ui.product_turn_count : undefined,
    closingMode: ui.product_closing_mode === true,
    userMessage: input.user_message,
  });
}

function ensureDecisionDisclaimer(message: string, input: FormatPhaseInput): string {
  if (!shouldEnforceDecisionDisclaimer(input)) return message;
  const normalized = message.toLowerCase();
  if (
    normalized.includes('decision final') ||
    normalized.includes('depende 100% del usuario') ||
    normalized.includes('debe tomarla el usuario')
  ) {
    return message;
  }
  return `${message}\n\nDecision final: debe tomarla el usuario de forma 100% informada. Esta recomendacion orienta, no sustituye su criterio ni su validacion final.`;
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
  const marketSnapshot =
    input.context_summary?.market_snapshot?.summary &&
    typeof input.context_summary.market_snapshot.summary === 'string'
      ? input.context_summary.market_snapshot.summary
      : '';
  const recommendationProfile =
    input.context_summary?.recommendation_profile &&
    typeof input.context_summary.recommendation_profile === 'object'
      ? JSON.stringify(input.context_summary.recommendation_profile)
      : '';
  const funnelStage = resolveFormatFunnelStage(input);
  const funnelInstructions = funnelStage ? buildActionPlanFormatInstructions(funnelStage) : '';

  const prompt = [
    funnelInstructions,
    funnelStage === 'deliver'
      ? 'Responde en español (Chile) con documento ejecutivo completo; secciones ## obligatorias; minimo 900 palabras si hay contexto.'
      : funnelStage === 'brainstorm'
      ? 'Responde en español (Chile): lluvia de ideas senior, bullets densos, max 220 palabras.'
      : funnelStage === 'converge'
      ? 'Responde en español (Chile): convergencia senior, max 320 palabras.'
      : 'Responde en español (Chile), breve y útil.',
    funnelStage === 'deliver'
      ? null
      : [
          'Entrega valor real al usuario en formato:',
          '1) tesis o respuesta directa,',
          '2) recomendacion o siguiente accion concreta,',
          '3) riesgos/condiciones o supuesto importante si aplica.',
        ].join('\n'),
    'No menciones nombres de tools, pipeline interno ni tecnicismos de backend.',
    'Si recomiendas productos, APV, inversiones o instituciones: cruza suitability, explicita riesgos y deja claro que la decision final depende 100% del usuario.',
    '',
    `Pregunta del usuario: ${input.user_message}`,
    recentThreadContext ? `Hilo reciente:\n${recentThreadContext}` : '',
    `Modo: ${input.mode}`,
    `Arquitectura del producto: ${productDirective || 'sin directiva especial'}`,
    marketSnapshot ? `Mercado vivo: ${marketSnapshot}` : '',
    recommendationProfile ? `Suitability: ${recommendationProfile}` : '',
    `Herramientas usadas: ${toolsUsed.join(', ') || 'ninguna'}`,
    `Artefactos: ${artifacts.map((a) => a.title).join(' | ') || 'ninguno'}`,
    '',
    'Regla: no escribas fuentes ni citas dentro del cuerpo; la UI las mostrará aparte en el bloque de citas.',
    'Evidencia resumida:',
    toolContext,
  ]
    .filter((line): line is string => line != null && line !== '')
    .join('\n');

  const raw = await complete(prompt, {
    systemPrompt:
      'Eres un asesor financiero senior. Tu prioridad es claridad, utilidad inmediata, precision y coherencia con la arquitectura del producto.',
    temperature: funnelStage === 'deliver' ? 0.25 : 0.2,
    maxCompletionTokens: funnelStage === 'deliver' ? 1400 : 520,
  });

  let cleaned = stripEmojis(cleanSpecialTags(raw)).trim();
  cleaned = sanitizeFormulaContent(cleaned);
  if (funnelStage === 'deliver') cleaned = enforceDeliverPlanStructure(cleaned);
  cleaned = ensureDecisionDisclaimer(cleaned, input);
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
      const ensuredCitations = await ensureMinimumCitations(input);
      const message = await buildFastValuableMessage(input);

      const formatted_response: FormattedResponse = {
        message: appendSourcesBlock(message, ensuredCitations),
        agent_blocks: input.execution_result?.agent_blocks || [],
        artifacts: input.execution_result?.artifacts || [],
        citations: ensuredCitations,
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

    const funnelStage = resolveFormatFunnelStage(input);
    const funnelInstructions = funnelStage ? buildActionPlanFormatInstructions(funnelStage) : '';

    const formatterInput = [
      funnelInstructions,
      `Modo: ${input.mode}`,
      `Directiva de producto: ${
        typeof input.context_summary?.product_directive === 'string'
          ? input.context_summary.product_directive
          : 'sin directiva especial'
      }`,
      typeof input.context_summary?.market_snapshot?.summary === 'string'
        ? `Mercado vivo: ${input.context_summary.market_snapshot.summary}`
        : '',
      input.context_summary?.recommendation_profile
        ? `Suitability: ${JSON.stringify(input.context_summary.recommendation_profile)}`
        : '',
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
    if (funnelStage === 'deliver') message = enforceDeliverPlanStructure(message);
    message = ensureDecisionDisclaimer(message, input);

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
    const ensuredCitations = await ensureMinimumCitations(input);
    message = appendSourcesBlock(message, ensuredCitations);

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
      citations: ensuredCitations,
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
    fallbackMessage = ensureDecisionDisclaimer(fallbackMessage, input);
    const ensuredCitations = await ensureMinimumCitations(input);
    fallbackMessage = appendSourcesBlock(fallbackMessage, ensuredCitations);

    const formatted_response: FormattedResponse = {
      message: fallbackMessage,
      agent_blocks: input.execution_result?.agent_blocks || [],
      artifacts: input.execution_result?.artifacts || [],
      citations: ensuredCitations,
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
