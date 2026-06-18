/**
 * format.phase.ts
 *
 * PHASE 3: Format Response
 * Generate final response, parse special tags, detect knowledge events
 */

import {
  complete,
  completeStream,
  completeWithClaude,
  completeWithClaudeStream,
} from '../../../services/llm.service';
import { CORE_RESPONSE_SYSTEM } from '../system.prompts';
import {
  resolveCoreAgentClaudeModel,
  resolveLiteToolsModel,
} from '../helpers/model-policy.helpers';
import { detectKnowledgeEvent } from '../knowledge-detector';
import { recordKnowledgeEvent, getMilestones, KNOWLEDGE_MILESTONES } from '../../../services/knowledge.service';
import {
  extractChartBlocksFromToolOutput,
  extractSuggestedReplies,
  extractPanelAction,
  extractBudgetTablePatch,
  cleanSpecialTags,
  inferQuestionnaireFromText,
} from '../helpers/chart-extraction.helpers';
import { stripEmojis } from '../helpers/format.helpers';
import { sanitizeFormulaContent } from '../helpers/formula-sanitizer';
import {
  ensureRegulatoryFooter,
  sanitizeAgentCapabilityClaims,
  sanitizeSuggestedReplies,
} from '../helpers/capability-claims.helpers';
import type { FormatPhaseInput, FormatPhaseOutput, FormattedResponse } from '../agent-types';
import type { Citation } from '../chat.types';
import { ensureEvidenceCitations } from '../helpers/evidence.helpers';
import { buildGroundingManifest, requiresVerifiedNumbers } from '../helpers/grounding.helpers';
import { getLogger } from '../../../logger';
import {
  buildActionPlanFormatInstructions,
  enforceDeliverPlanStructure,
  resolveActionPlanFunnelStage,
  type ActionPlanFunnelStage,
} from '../helpers/action-plan-funnel.helpers';
import {
  buildSocialConsciousnessFormatInstructions,
  enforceSocialSynthesisStructure,
  resolveSocialConsciousnessFunnelStage,
  type SocialConsciousnessFunnelStage,
} from '../helpers/social-consciousness-funnel.helpers';
import {
  buildLoadedFinancialEvidenceBlock,
  type AgentBudgetRow,
  type FinancialEvidenceSnapshot,
} from '../helpers/agent-financial-evidence.helpers';

export function shouldReuseExecuteDraft(input: FormatPhaseInput): boolean {
  const draft = String(input.execution_result?.assistant_draft ?? '').trim();
  if (draft.length < 24) return false;
  if (!['information', 'education', 'containment'].includes(input.mode)) return false;
  if (resolveFormatFunnelStage(input) === 'deliver') return false;
  if (resolveFormatSocialFunnelStage(input) === 'synthesis') return false;
  if ((input.execution_result?.artifacts?.length ?? 0) > 0) return false;
  if ((input.execution_result?.agent_blocks?.length ?? 0) > 0) return false;

  const substantiveTools = (input.execution_result?.tool_calls ?? []).filter(
    (toolCall) =>
      toolCall.status === 'success' &&
      !String(toolCall.id).startsWith('prefetch-') &&
      !['rag.lookup', 'regulatory.lookup_cl', 'web.search'].includes(toolCall.tool),
  );
  return substantiveTools.length === 0;
}

export function shouldApplyLatexFormatting(message: string): boolean {
  if (!message || message.length < 120) return false;
  const hasDisplayMath = /\$\$[\s\S]+\$\$/.test(message);
  // Require at least one digit or math operator inside $...$ to avoid matching $word$ or $ACRONYM$
  const hasInlineMath = /\$[^$\n]*[\d+\-*/^=()[\]{}][^$\n]*\$/.test(message);
  const hasLatexEscape = /\\(frac|sum|int|sqrt|cdot|times|left|right|begin|end|\(|\)|\[|\])/i.test(message);
  const hasEquation = /\b[A-Za-zÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑ0-9_]{1,}\s*=\s*[^=\n]+/.test(message);

  return hasDisplayMath || hasInlineMath || hasLatexEscape || hasEquation;
}

export function buildFormatSafeFallbackMessage(input: FormatPhaseInput): string {
  const draft = String(input.execution_result?.assistant_draft ?? '').trim();
  if (draft.length >= 12) return draft;

  const toolOutputs = input.execution_result?.tool_outputs ?? [];
  const toolSummary = toolOutputs
    .slice(-2)
    .map((output: unknown) => {
      if (typeof output === 'string') return output.trim();
      if (output && typeof output === 'object' && 'summary' in output) {
        return String((output as { summary?: unknown }).summary ?? '').trim();
      }
      return '';
    })
    .filter((chunk) => chunk.length > 0)
    .join('\n\n')
    .trim();
  if (toolSummary.length >= 24) return toolSummary.slice(0, 1600);

  return 'Preparé una respuesta base con los resultados disponibles. Si quieres, la refinamos en el siguiente mensaje.';
}

async function completeFormatWithFallback(
  formatterInput: string,
  fullFormatOptions: {
    systemPrompt: string;
    temperature: number;
    model: string;
    allowOpenAIFallback: false;
  },
  onDelta: ((delta: string) => void) | undefined,
  reuseExecuteDraft: boolean,
  assistantDraft: string,
): Promise<string> {
  if (reuseExecuteDraft) return assistantDraft;

  try {
    return onDelta
      ? await completeWithClaudeStream(formatterInput, fullFormatOptions, onDelta)
      : await completeWithClaude(formatterInput, fullFormatOptions);
  } catch (claudeErr) {
    getLogger().warn({
      msg: '[Format] Claude failed, trying OpenAI fallback',
      error: claudeErr,
    });
    const openAiOptions = {
      systemPrompt: fullFormatOptions.systemPrompt,
      temperature: fullFormatOptions.temperature,
      model: resolveLiteToolsModel(),
    };
    return onDelta
      ? await completeStream(formatterInput, openAiOptions, onDelta)
      : await complete(formatterInput, openAiOptions);
  }
}

function stripInlineSourcesBlock(message: string): string {
  return message
    .replace(/\n{0,2}#{0,3}\s*fuentes\s*:?[ \t]*\n[\s\S]*$/i, '')
    .trim();
}

/**
 * Serialize key intake numbers into a compact, grounded block so the LLM
 * uses verified figures instead of hallucinating from user messages.
 */
function buildUserFinancialProfileBlock(intake: unknown): string {
  if (!intake || typeof intake !== 'object') return '';
  const env = intake as Record<string, unknown>;
  // Handle both raw IntakeQuestionnaire and IntakeEnvelope shapes
  const raw = (env.intake && typeof env.intake === 'object'
    ? env.intake
    : env) as Record<string, unknown>;

  const parts: string[] = [];
  if (typeof raw.age === 'number') parts.push(`Edad: ${raw.age} años`);
  if (typeof raw.city === 'string' && raw.city) parts.push(`Ciudad: ${raw.city}`);
  if (typeof raw.profession === 'string' && raw.profession) parts.push(`Profesión: ${raw.profession}`);

  if (typeof raw.exactMonthlyIncome === 'number') {
    parts.push(`Ingreso mensual exacto: $${raw.exactMonthlyIncome.toLocaleString('es-CL')} CLP`);
  } else if (typeof raw.incomeBand === 'string') {
    parts.push(`Rango de ingreso: ${raw.incomeBand}`);
  }

  if (typeof raw.exactSavingsAmount === 'number') {
    parts.push(`Ahorros/inversiones exactos: $${raw.exactSavingsAmount.toLocaleString('es-CL')} CLP`);
  } else if (raw.hasSavingsOrInvestments) {
    if (typeof raw.savingsBand === 'string') parts.push(`Rango de ahorros: ${raw.savingsBand}`);
    else parts.push('Tiene ahorros/inversiones: sí');
  }

  if (raw.hasDebt !== undefined) parts.push(`Tiene deuda: ${raw.hasDebt ? 'sí' : 'no'}`);
  if (typeof raw.moneyStressLevel === 'number') parts.push(`Estrés financiero: ${raw.moneyStressLevel}/10`);
  if (typeof raw.selfRatedUnderstanding === 'number') {
    parts.push(`Conocimiento financiero auto-evaluado: ${raw.selfRatedUnderstanding}/10`);
  }

  if (parts.length === 0) return '';
  return (
    'DATOS FINANCIEROS VERIFICADOS DEL USUARIO (usa estos números, no inferas otros):\n' +
    parts.map((p) => `- ${p}`).join('\n')
  );
}

function hasRecentRegulatoryFooter(input: FormatPhaseInput): boolean {
  const recentThreadContext =
    typeof input.context_summary?.recent_thread_context === 'string'
      ? input.context_summary.recent_thread_context.toLowerCase()
      : '';

  return (
    recentThreadContext.includes('cmf') &&
    (recentThreadContext.includes('no está respaldado') ||
      recentThreadContext.includes('no esta respaldado'))
  );
}

function resolveFormatSocialFunnelStage(input: FormatPhaseInput): SocialConsciousnessFunnelStage | null {
  const profile = input.context_summary?.recommendation_profile as
    | { social_consciousness_funnel_stage?: SocialConsciousnessFunnelStage | null }
    | undefined;
  if (profile?.social_consciousness_funnel_stage) return profile.social_consciousness_funnel_stage;

  const ui = input.ui_state ?? {};
  return resolveSocialConsciousnessFunnelStage({
    activeChatId: (ui.active_chat as { id?: string } | undefined)?.id ?? ui.active_chat,
    turnCount: typeof ui.product_turn_count === 'number' ? ui.product_turn_count : undefined,
    closingMode: ui.product_closing_mode === true,
    userMessage: input.user_message,
  });
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

export function ensureDecisionDisclaimer(message: string, input: FormatPhaseInput): string {
  if (hasRecentRegulatoryFooter(input)) return message;
  const activeChatId = String(input.ui_state?.active_chat?.id ?? '');
  return ensureRegulatoryFooter(message, { mode: input.mode, activeChatId });
}

export async function runFormatPhase(input: FormatPhaseInput): Promise<FormatPhaseOutput> {
  const logger = getLogger();
  const startTime = Date.now();
  const onDelta = input.stream ? (delta: string) => input.stream?.messageDelta(delta) : undefined;

  try {
    input.stream?.phase('format', 'start');
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
    const socialFunnelStage = resolveFormatSocialFunnelStage(input);
    const funnelInstructions = funnelStage ? buildActionPlanFormatInstructions(funnelStage) : '';
    const socialFunnelInstructions = socialFunnelStage
      ? buildSocialConsciousnessFormatInstructions(socialFunnelStage)
      : '';
    const activeChatId = String(
      (input.ui_state?.active_chat as { id?: string } | undefined)?.id ?? '',
    );
    const userFinancialProfileFull = buildUserFinancialProfileBlock(
      input.injected_intake ?? input.context_summary?.intake
    );
    const financialEvidence = input.context_summary?.financial_evidence as
      | FinancialEvidenceSnapshot
      | undefined;
    const budgetRows = Array.isArray(input.context_summary?.budget_rows)
      ? (input.context_summary.budget_rows as AgentBudgetRow[])
      : [];
    const loadedEvidenceBlock =
      financialEvidence && (financialEvidence.has_budget_totals || financialEvidence.has_transactions || financialEvidence.has_diagnostic_profile)
        ? buildLoadedFinancialEvidenceBlock(financialEvidence, budgetRows)
        : '';

    const groundingManifest = buildGroundingManifest(input.execution_result);
    const groundingRule = requiresVerifiedNumbers(input.mode)
      ? 'No inventes cifras: usa solo el manifiesto de hechos verificados, intake o citas.'
      : 'Prioriza hechos verificados; si falta evidencia, dilo explícitamente.';

    const chat2PremiumRules =
      activeChatId === 'chat-2'
        ? [
            'CHAT 2 — ESTANDAR PREMIUM:',
            '- Tono wealth advisory Chile: preciso, sobrio, sin hype ni promesas de rentabilidad.',
            '- Ancla cada hipotesis a diagnostico, presupuesto, cartolas o mercado verificable.',
            '- Si falta evidencia numerica, declara el vacio; no completes con supuestos.',
            funnelStage === 'deliver'
              ? '- ENTREGA FINAL: cada seccion ## con contenido denso, plazos concretos y metricas trazables o marcadas como pendientes de validar.'
              : funnelStage === 'converge'
                ? '- CONVERGENCIA: sintetiza la prioridad del usuario antes de recomendar una ruta tentativa.'
                : '- EXPLORACION: abre con hipotesis accionables; no entregues aun el plan estructurado completo.',
          ].join('\n')
        : '';

    const chat3PremiumRules =
      activeChatId === 'chat-3'
        ? [
            'CHAT 3 — ESTANDAR PREMIUM:',
            '- Modo filosofo socratico: reflexion sobre valores, dinero y sociedad.',
            '- NO emitas bloques CHART/TABLE ni simulaciones salvo peticion explicita del usuario.',
            '- Integra diagnostico y presupuesto solo como espejo de valores, no como plan financiero.',
            socialFunnelStage === 'synthesis'
              ? '- SINTESIS REFLEXIVA: cada seccion ## con contenido denso y pregunta abierta final.'
              : socialFunnelStage === 'tension'
                ? '- TENSION: contraste 2 posturas y dilema etico personal antes de cerrar.'
                : '- EXPLORACION: apertura existencial + una pregunta profunda; sin consejos financieros directos.',
          ].join('\n')
        : '';

    const formatterInput = [
      chat2PremiumRules,
      chat3PremiumRules,
      funnelInstructions,
      typeof input.context_summary?.action_plan_session_brief === 'string'
        ? input.context_summary.action_plan_session_brief
        : '',
      socialFunnelInstructions,
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
      userFinancialProfileFull ? `\n${userFinancialProfileFull}\n` : '',
      loadedEvidenceBlock ? `\n${loadedEvidenceBlock}\n` : '',
      ...(snowballCtx ? [`\n${snowballCtx}\n`] : []),
      ...(recentThreadContext ? [`\n${recentThreadContext}\n`] : []),
      groundingManifest,
      groundingRule,
      'Mensaje del usuario:',
      input.user_message,
      '',
      'Contexto de ejecucion (tools, outputs, artifacts, citations):',
      executionSummary,
      '',
      'Instruccion: responde en espanol, limpio, sin nombres de tools ni XML interno.',
      activeChatId === 'chat-3'
        ? 'En chat-3 prioriza prosa reflexiva; emite SUGERENCIAS filosoficas al final si aplica.'
        : 'Si hay datos numericos comparables, emite bloques <CHART> y/o <TABLE> JSON validos (obligatorio cuando aplique) antes de SUGERENCIAS.',
    ].join('\n');

    const reuseExecuteDraft = shouldReuseExecuteDraft(input);
    const fullFormatOptions = {
      systemPrompt: CORE_RESPONSE_SYSTEM,
      temperature:
        funnelStage === 'deliver' || socialFunnelStage === 'synthesis' ? 0.25 : 0.4,
      model: resolveCoreAgentClaudeModel(),
      allowOpenAIFallback: false as const,
    };
    const rawResponse = await completeFormatWithFallback(
      formatterInput,
      fullFormatOptions,
      onDelta,
      reuseExecuteDraft,
      String(input.execution_result?.assistant_draft ?? '').trim(),
    );

    const suggested_replies = sanitizeSuggestedReplies(extractSuggestedReplies(rawResponse));
    const panel_action = extractPanelAction(rawResponse);
    const budget_table_patch = extractBudgetTablePatch({
      text: rawResponse,
      tool_outputs: input.execution_result?.tool_outputs,
      ui_state: input.ui_state,
    });
    const responseChartBlocks = extractChartBlocksFromToolOutput(rawResponse);

    let message = cleanSpecialTags(rawResponse);
    message = stripEmojis(message).trim();
    message = sanitizeFormulaContent(message);
    message = sanitizeAgentCapabilityClaims(message);
    if (funnelStage === 'deliver') message = enforceDeliverPlanStructure(message);
    if (socialFunnelStage === 'synthesis') message = enforceSocialSynthesisStructure(message);
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

    const ensuredCitations = await ensureEvidenceCitations(input);
    message = stripInlineSourcesBlock(message);

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
      budget_table_patch,
    };

    logger.info({
      msg: '[Format] Phase complete',
      has_suggestions: suggested_replies.length > 0,
      has_artifacts: formatted_response.artifacts.length > 0,
      reused_execute_draft: reuseExecuteDraft,
      latency_ms: Date.now() - startTime,
    });

    return { formatted_response };
  } catch (err) {
    logger.warn({ msg: '[Format] Phase failed, using safe fallback', error: err, latency_ms: Date.now() - startTime });

    let fallbackMessage = buildFormatSafeFallbackMessage(input);
    fallbackMessage = sanitizeFormulaContent(fallbackMessage);
    fallbackMessage = ensureDecisionDisclaimer(fallbackMessage, input);
    const ensuredCitations = await ensureEvidenceCitations(input);
    fallbackMessage = stripInlineSourcesBlock(fallbackMessage);

    const formatted_response: FormattedResponse = {
      message: fallbackMessage,
      agent_blocks: input.execution_result?.agent_blocks || [],
      artifacts: input.execution_result?.artifacts || [],
      citations: ensuredCitations,
      suggested_replies: [],
      panel_action: undefined,
      budget_table_patch: undefined,
    };

    return { formatted_response };
  } finally {
    input.stream?.phase('format', 'done');
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
