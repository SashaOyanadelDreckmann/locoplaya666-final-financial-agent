/**
 * plan-execute.phase.ts
 *
 * PHASE 2: Planning + Execution (ReAct Loop)
 * Decides which tools to call and executes them in a loop
 */

import { getOpenAIClient, withCompatibleTemperature, accumulateLLMCost } from '../../../services/llm.service';
import {
  buildCoreAgentOpenAITools,
  getOriginalToolName,
  isCoreAgentExcludedTool,
  CORE_AGENT_PDF_HANDOFF_MESSAGE,
} from '../../../mcp/openai-bridge';
import { runMCPTool } from '../../../mcp/tools/runMCPTool';
import { retrieveRAGContext } from '../../../services/rag.service';
import { CORE_TOOL_AGENT_SYSTEM } from '../system.prompts';
import {
  buildTrustedWebQuery,
  chat3RequestsNumericGrounding,
  isChat3BlockedTool,
  isFactualInfoMode,
  shouldBypassWebEvidenceCache,
  shouldPrefetchTrustedWeb,
} from '@financial-agent/shared';
import { extractChartBlocksFromToolOutput } from '../helpers/chart-extraction.helpers';
import { resolvePlanExecuteModel } from '../helpers/model-policy.helpers';
import { isArtifactLike } from '../helpers/validation.helpers';
import { enrichWebSearchWithTrustedRead } from '../../../mcp/tools/web/trustedWebRead';
import type { ExecutionResult, PlanPhaseInput, PlanPhaseOutput } from '../agent-types';
import type { ToolCall, Citation, Artifact, AgentBlock } from '../chat.types';
import { getLogger } from '../../../logger';
import type OpenAI from 'openai';

const MAX_REACT_ITERATIONS = Number(process.env.AGENT_MAX_REACT_ITERATIONS || 4);
const REACT_TIMEOUT_MS = Number(process.env.AGENT_REACT_TIMEOUT_MS || 18000);
const AUTO_WEB_VERIFY_ENABLED =
  process.env.NODE_ENV !== 'test' &&
  (process.env.AGENT_ALWAYS_VERIFY_WEB ?? 'true').toLowerCase() !== 'false';
const WEB_VERIFY_CACHE_TTL_MS = Number(
  process.env.AGENT_WEB_VERIFY_CACHE_TTL_MS ?? 10 * 60 * 1000
);
const REGULATORY_KEYWORDS =
  /\b(cmf|fintec|fintech|ley\s*21\.?521|normativa|regulator|sfa|finanzas abiertas|comision para el mercado financiero)\b/i;
const TRIVIAL_GREETING =
  /^\s*(hola|buenas|buenos dias|buenas tardes|buenas noches|gracias|ok|dale|listo)\s*[.!?]*\s*$/i;

type CachedWebEvidence = {
  ts: number;
  query: string;
  results: any;
  citations: Citation[];
};

const webEvidenceCacheByUser = new Map<string, CachedWebEvidence[]>();

function resolveIterationBudget(input: PlanPhaseInput): number {
  const base = Math.max(1, MAX_REACT_ITERATIONS);
  const mode = input.classification.mode;
  if (mode === 'information' || mode === 'education') return Math.min(base, 2);
  if (mode === 'budgeting' || mode === 'comparison' || mode === 'planification') return Math.min(base, 3);
  return base; // regulation/simulation/decision_support/containment keep full depth
}

const PURE_CALC_PATTERN =
  /\b(cuanto es|cu[aá]nto es|calcul[ae]|si aporto|si ahorro|si tengo|en cu[aá]nto tiempo|cuantos meses|cu[aá]ntos meses|a raz[oó]n de|si pago|si invierto)\b/i;
const MARKET_DATA_PATTERN =
  /\b(tasa|tpm|uf|utm|d[oó]lar|euro|mercado|hoy|actual|precio|divisa|inflaci[oó]n|rendimiento|retorno|banco central|bcentral|bcch)\b/i;

function shouldAutoWebVerify(userMessage?: string): boolean {
  const msg = String(userMessage ?? '').trim();
  if (!msg) return false;
  if (TRIVIAL_GREETING.test(msg)) return false;
  if (PURE_CALC_PATTERN.test(msg) && !MARKET_DATA_PATTERN.test(msg)) return false;
  return true;
}

function normalizeForSemanticCache(text: string): string[] {
  return String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 4);
}

function semanticSimilarity(a: string, b: string): number {
  const aTokens = new Set(normalizeForSemanticCache(a));
  const bTokens = new Set(normalizeForSemanticCache(b));
  if (aTokens.size === 0 || bTokens.size === 0) return 0;
  let intersection = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) intersection += 1;
  }
  const union = new Set([...aTokens, ...bTokens]).size || 1;
  return intersection / union;
}

function findCachedWebEvidence(userId: string, query: string): CachedWebEvidence | null {
  const now = Date.now();
  const entries = webEvidenceCacheByUser.get(userId) ?? [];
  const freshEntries = entries.filter((entry) => now - entry.ts <= WEB_VERIFY_CACHE_TTL_MS);
  if (freshEntries.length !== entries.length) webEvidenceCacheByUser.set(userId, freshEntries);
  let best: CachedWebEvidence | null = null;
  let bestScore = 0;
  for (const entry of freshEntries) {
    const score = semanticSimilarity(entry.query, query);
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }
  return bestScore >= 0.55 ? best : null;
}

function storeCachedWebEvidence(userId: string, evidence: CachedWebEvidence): void {
  const current = webEvidenceCacheByUser.get(userId) ?? [];
  const next = [evidence, ...current].slice(0, 8); // keep cache cheap and bounded
  webEvidenceCacheByUser.set(userId, next);
  // Prevent unbounded global growth: max 256 users * 8 entries = 2048 total
  if (webEvidenceCacheByUser.size > 256) {
    const firstKey = webEvidenceCacheByUser.keys().next().value;
    if (firstKey) webEvidenceCacheByUser.delete(firstKey);
  }
}

/**
 * Run ReAct loop: classify → identify tools → execute in loop until complete
 */
export async function runPlanExecutePhase(input: PlanPhaseInput): Promise<PlanPhaseOutput> {
  const logger = getLogger();
  const startTime = Date.now();

  try {
    input.stream?.phase('execute', 'start');
    const client = getOpenAIClient();

    // Build tool definitions for OpenAI
    const openaiTools = buildCoreAgentOpenAITools();

    // Initialize accumulators
    const tool_calls: ToolCall[] = [];
    const tool_outputs: Array<{ tool: string; data: any }> = [];
    const citations: Citation[] = [];
    const artifacts: Artifact[] = [];
    const agent_blocks: AgentBlock[] = [];
    const react_trace: Array<{ iteration: number; decision: string; result: string }> = [];
    const activeChatId = String(
      (input.context_summary?.ui_state_snapshot as { active_chat?: { id?: string } } | undefined)
        ?.active_chat?.id ?? '',
    );
    const chat3Mode = activeChatId === 'chat-3';
    const shouldRunTools =
      input.classification.requires_tools === true || input.classification.requires_rag === true;
    const shouldGroundWithWeb =
      AUTO_WEB_VERIFY_ENABLED &&
      (!chat3Mode || chat3RequestsNumericGrounding(input.user_message)) &&
      shouldAutoWebVerify(input.user_message) &&
      shouldPrefetchTrustedWeb({
        userMessage: input.user_message,
        mode: input.classification.mode,
        requiresTools: input.classification.requires_tools,
        requiresRag: input.classification.requires_rag,
      });
    const bypassWebCache = shouldBypassWebEvidenceCache(input.user_message);
    const iterationBudget = resolveIterationBudget(input);
    const isRegulatoryRequest =
      input.classification.mode === 'regulation' ||
      input.classification.requires_rag === true ||
      REGULATORY_KEYWORDS.test(input.classification.intent) ||
      REGULATORY_KEYWORDS.test(input.user_message ?? '');
    const shouldPrefetchRag =
      isRegulatoryRequest || isFactualInfoMode(input.classification.mode);

    // Warm up regulatory/knowledge citations early to reduce unsupported claims.
    if (shouldPrefetchRag) {
      try {
        const ragQuery = `${input.user_message ?? input.classification.intent} Ley 21.521 CMF glosario financiero`;
        const ragCitations = await retrieveRAGContext(ragQuery, {
          mode: input.classification.mode,
          intent: input.classification.intent,
        });
        if (ragCitations.length > 0) {
          input.stream?.tool('rag.lookup', 'start', { iteration: 0 });
          citations.push(...ragCitations);
          tool_outputs.push({
            tool: 'rag.lookup',
            data: { found: ragCitations.length, citations: ragCitations },
          });
          tool_calls.push({
            id: `prefetch-rag-${Date.now()}`,
            tool: 'rag.lookup',
            args: { query: ragQuery, limit: 6 },
            status: 'success',
          });
          react_trace.push({
            iteration: 0,
            decision: 'Prefetch RAG regulatorio',
            result: 'success',
          });
          input.stream?.tool('rag.lookup', 'done', { iteration: 0 });
        }
      } catch (err) {
        logger.warn({
          msg: '[Execute] Regulatory RAG prefetch failed (non-blocking)',
          error: err,
        });
      }
    }

    if (isRegulatoryRequest) {
      try {
        const regulatoryQuery = String(input.user_message ?? input.classification.intent);
        input.stream?.tool('regulatory.lookup_cl', 'start', { iteration: 0 });
        const regulatoryResult = await runMCPTool({
          tool: 'regulatory.lookup_cl',
          args: { query: regulatoryQuery, limit: 3 },
          turn_id: input.turn_id || 'unknown',
          user_id: input.user_id || 'unknown',
        });

        if (regulatoryResult.tool_call?.status === 'success' || !regulatoryResult.tool_call?.status) {
          const regulatoryCitations = [
            ...(Array.isArray(regulatoryResult.citations) ? regulatoryResult.citations : []),
            ...(Array.isArray(regulatoryResult.data?.citations) ? regulatoryResult.data.citations : []),
          ];
          if (regulatoryCitations.length > 0) {
            citations.push(...regulatoryCitations);
          }
          tool_outputs.push({
            tool: 'regulatory.lookup_cl',
            data: regulatoryResult.data,
          });
          tool_calls.push({
            id: `prefetch-regulatory-${Date.now()}`,
            tool: 'regulatory.lookup_cl',
            args: { query: regulatoryQuery, limit: 3 },
            status: 'success',
          });
          react_trace.push({
            iteration: 0,
            decision: 'Prefetch regulatorio CMF/Ley Chile',
            result: 'success',
          });
        }
        input.stream?.tool('regulatory.lookup_cl', 'done', { iteration: 0 });
      } catch (err) {
        logger.warn({
          msg: '[Execute] Regulatory lookup prefetch failed (non-blocking)',
          error: err,
        });
        input.stream?.tool('regulatory.lookup_cl', 'error', { iteration: 0 });
      }
    }

    // Cheap-by-design web grounding: one trusted search per meaningful turn.
    if (shouldGroundWithWeb) {
      try {
        const cacheUserId = input.user_id || 'unknown';
        const webQuery = buildTrustedWebQuery(String(input.user_message ?? input.classification.intent));
        const cached = !bypassWebCache ? findCachedWebEvidence(cacheUserId, webQuery) : null;

        if (cached) {
          input.stream?.tool('web.search', 'start', { iteration: 0 });
          citations.push(...cached.citations);
          tool_outputs.push({
            tool: 'web.search',
            data: cached.results,
          });
          tool_calls.push({
            id: `prefetch-web-${Date.now()}`,
            tool: 'web.search',
            args: { query: cached.query, limit: 3, cache_hit: true },
            status: 'success',
          });
          react_trace.push({
            iteration: 0,
            decision: 'Prefetch web confiable (cache)',
            result: 'cache_hit',
          });
          input.stream?.tool('web.search', 'done', { iteration: 0 });
        } else {
          input.stream?.tool('web.search', 'start', { iteration: 0 });
          const webResult = await runMCPTool({
            tool: 'web.search',
            args: { query: webQuery, limit: 3 },
            turn_id: input.turn_id || 'unknown',
            user_id: input.user_id || 'unknown',
          });

          if (webResult.tool_call?.status === 'success' || !webResult.tool_call?.status) {
            const searchResults = Array.isArray(webResult.data?.results)
              ? (webResult.data.results as Array<{ url?: string; title?: string; snippet?: string }>)
              : undefined;
            const trustedRead = await enrichWebSearchWithTrustedRead({
              query: webQuery,
              results: searchResults,
            });
            const webData =
              trustedRead.trusted_page_read && webResult.data && typeof webResult.data === 'object'
                ? { ...webResult.data, trusted_page_read: trustedRead.trusted_page_read }
                : webResult.data;
            const gatheredCitations = [
              ...(Array.isArray(webResult.citations) ? webResult.citations : []),
              ...(Array.isArray(webResult.data?.citations) ? webResult.data.citations : []),
              ...(trustedRead.citation ? [trustedRead.citation] : []),
            ];
            citations.push(...gatheredCitations);
            tool_outputs.push({
              tool: 'web.search',
              data: webData,
            });
            tool_calls.push({
              id: `prefetch-web-${Date.now()}`,
              tool: 'web.search',
              args: { query: webQuery, limit: 3 },
              status: 'success',
            });
            react_trace.push({
              iteration: 0,
              decision: 'Prefetch web confiable',
              result: trustedRead.trusted_page_read ? 'success_with_page_read' : 'success',
            });
            storeCachedWebEvidence(cacheUserId, {
              ts: Date.now(),
              query: webQuery,
              results: webData,
              citations: gatheredCitations,
            });
            input.stream?.tool('web.search', 'done', { iteration: 0 });
          }
        }
      } catch (err) {
        logger.warn({
          msg: '[Execute] Trusted web prefetch failed (non-blocking)',
          error: err,
        });
        input.stream?.tool('web.search', 'error', { iteration: 0 });
        tool_calls.push({
          id: `prefetch-web-error-${Date.now()}`,
          tool: 'web.search',
          args: { prefetch: true },
          status: 'error',
          error_message: String(err),
        });
      }
    }

    const uniquePrefetchArtifacts = Array.from(
      new Map(artifacts.map((a) => [a.id, a])).values(),
    );

    if (!shouldRunTools) {
      react_trace.push({
        iteration: 0,
        decision: 'Skip tools by classifier',
        result: 'requires_tools=false',
      });
      logger.info({
        msg: '[Execute] Skipping tool loop by classifier decision',
        mode: input.classification.mode,
      });
      input.stream?.phase('execute', 'done');
      return {
        execution_result: {
          tool_calls,
          tool_outputs,
          artifacts: uniquePrefetchArtifacts,
          agent_blocks,
          citations,
          react_trace,
          iterations_count: 0,
        },
        plan_objective: input.classification.intent,
      };
    }

    // Build loop messages
    const loopMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: CORE_TOOL_AGENT_SYSTEM,
      },
      {
        role: 'user',
        content: buildExecutionPrompt(input),
      },
    ];

    // ReAct Loop
    let iterations = 0;
    let is_complete = false;

    while (iterations < iterationBudget && !is_complete && Date.now() - startTime < REACT_TIMEOUT_MS) {
      iterations++;
      react_trace.push({
        iteration: iterations,
        decision: 'Evaluate next step',
        result: 'pending',
      });
      const planMaxTokens = Number(process.env.OPENAI_PLAN_MAX_COMPLETION_TOKENS || 1024);

      const model = resolvePlanExecuteModel({
        userMessage: input.user_message ?? '',
        mode: input.classification.mode,
        requiresTools: input.classification.requires_tools,
        preferredOutput: input.inferred_user_model?.preferred_output,
      });
      const response = await client.chat.completions.create(
        withCompatibleTemperature(
          {
            model,
            max_completion_tokens: Number.isFinite(planMaxTokens) ? planMaxTokens : 2048,
            tools: openaiTools,
            tool_choice: 'auto',
            messages: loopMessages,
          },
          model,
          0,
        ) as any,
      );

      if (response.usage) {
        accumulateLLMCost(model, response.usage.prompt_tokens ?? 0, response.usage.completion_tokens ?? 0);
      }
      const assistantMessage = response.choices?.[0]?.message;
      if (!assistantMessage) {
        if (react_trace.length > 0) {
          react_trace[react_trace.length - 1].result = 'no_message';
        }
        is_complete = true;
        break;
      }

      const assistantText = typeof assistantMessage.content === 'string'
        ? assistantMessage.content
        : '';

      // Check if model is done without tool calls
      if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
        if (react_trace.length > 0) {
          react_trace[react_trace.length - 1].decision = 'Complete without tool calls';
          react_trace[react_trace.length - 1].result = 'complete';
        }
        is_complete = true;
        if (assistantText) loopMessages.push({ role: 'assistant', content: assistantText });
        break;
      }

      if (react_trace.length > 0) {
        react_trace[react_trace.length - 1].decision = `Requested ${assistantMessage.tool_calls.length} tool call(s)`;
        react_trace[react_trace.length - 1].result = 'tool_calls_requested';
      }

      // Add assistant message with requested tool calls
      loopMessages.push({
        role: 'assistant',
        content: assistantText || null,
        tool_calls: assistantMessage.tool_calls,
      });

      // Execute each tool
      for (const toolUse of assistantMessage.tool_calls) {
        const originalName = getOriginalToolName(toolUse.function.name);
        const parsedArgs = safeJsonParse(toolUse.function.arguments);

        react_trace.push({
          iteration: iterations,
          decision: `Use tool: ${originalName}`,
          result: 'pending',
        });
        if (isCoreAgentExcludedTool(originalName)) {
          tool_calls.push({
            id: toolUse.id,
            tool: originalName,
            args: parsedArgs,
            status: 'error',
          });
          loopMessages.push({
            role: 'tool',
            tool_call_id: toolUse.id,
            content: JSON.stringify({
              ok: false,
              error: 'tool_not_available_in_core_agent',
              message: CORE_AGENT_PDF_HANDOFF_MESSAGE,
            }),
          });
          react_trace[react_trace.length - 1].result = 'blocked_pdf_handoff';
          continue;
        }

        if (chat3Mode && isChat3BlockedTool(originalName, input.user_message)) {
          tool_calls.push({
            id: toolUse.id,
            tool: originalName,
            args: parsedArgs,
            status: 'error',
          });
          loopMessages.push({
            role: 'tool',
            tool_call_id: toolUse.id,
            content: JSON.stringify({
              ok: false,
              error: 'chat3_philosophical_mode',
              message:
                'Chat 3 prioriza reflexion socratica. Evita herramientas financieras salvo que el usuario pida explicitamente numeros, simulacion o marco regulatorio.',
            }),
          });
          react_trace[react_trace.length - 1].result = 'blocked_chat3_tool';
          continue;
        }

        input.stream?.tool(originalName, 'start', { iteration: iterations });

        try {
          let result: any;

          // Execute MCP tool with proper contract
          const toolResult = await runMCPTool({
            tool: originalName,
            args: parsedArgs,
            turn_id: input.turn_id || 'unknown',
            user_id: input.user_id || 'unknown',
          });

          const toolStatus = toolResult.tool_call?.status === 'success' ? 'success' : 'error';

          if (toolStatus === 'success') {
            // Extract charts if present
            const charts = extractChartBlocksFromToolOutput(
              JSON.stringify(toolResult.data)
            );
            agent_blocks.push(...charts);

            // Extract citations if present (support both top-level and nested shapes)
            if (Array.isArray(toolResult.citations)) {
              citations.push(...toolResult.citations);
            }
            if (Array.isArray(toolResult.data?.citations)) {
              citations.push(...toolResult.data.citations);
            }

            // Extract artifact(s) if present (single or list)
            const data = toolResult.data;
            if (isArtifactLike(data)) {
              artifacts.push(data as Artifact);
            }
            if (Array.isArray(data?.artifacts)) {
              for (const a of data.artifacts) {
                if (isArtifactLike(a)) artifacts.push(a as Artifact);
              }
            }
            if (isArtifactLike(data?.artifact)) {
              artifacts.push(data.artifact as Artifact);
            }

            result = toolResult.data;
          } else {
            result = toolResult.data ?? { error: toolResult.tool_call?.error_message || 'Tool execution failed' };
          }

          tool_calls.push({
            id: toolUse.id,
            tool: originalName,
            args: parsedArgs,
            status: toolStatus,
            error_message: toolStatus === 'error' ? toolResult.tool_call?.error_message : undefined,
          });

          tool_outputs.push({
            tool: originalName,
            data: result,
          });

          loopMessages.push({
            role: 'tool',
            tool_call_id: toolUse.id,
            content: JSON.stringify(result),
          });

          react_trace[react_trace.length - 1].result = toolStatus === 'success' ? 'success' : 'failed';
          input.stream?.tool(originalName, toolStatus === 'success' ? 'done' : 'error', {
            iteration: iterations,
          });
        } catch (err) {
          logger.warn({
            msg: '[Execute] Tool failed',
            tool: originalName,
            error: err,
          });
          input.stream?.tool(originalName, 'error', { iteration: iterations });

          tool_calls.push({
            id: toolUse.id,
            tool: originalName,
            args: parsedArgs,
            status: 'error',
          });

          loopMessages.push({
            role: 'tool',
            tool_call_id: toolUse.id,
            content: JSON.stringify({ error: String(err) }),
          });

          react_trace[react_trace.length - 1].result = 'failed';
        }
      }

    }

    for (const step of react_trace) {
      if (step.result === 'pending') step.result = 'interrupted';
    }

    const uniqueArtifacts = Array.from(
      new Map(artifacts.map((a) => [a.id, a])).values()
    );

    const execution_result: ExecutionResult = {
      tool_calls,
      tool_outputs,
      artifacts: uniqueArtifacts,
      agent_blocks,
      citations,
      react_trace,
      iterations_count: iterations,
      assistant_draft: extractReusableAssistantDraft(loopMessages, iterations),
    };

    logger.info({
      msg: '[Execute] ReAct loop complete',
      iterations,
      iteration_budget: iterationBudget,
      tool_calls_count: tool_calls.length,
      latency_ms: Date.now() - startTime,
    });

    input.stream?.phase('execute', 'done');
    return {
      execution_result,
      plan_objective: input.classification.intent,
    };
  } catch (err) {
    logger.error({
      msg: '[Execute] Phase failed',
      error: err,
      latency_ms: Date.now() - startTime,
    });
    throw err;
  }
}

function extractReusableAssistantDraft(
  loopMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  iterations: number,
): string | undefined {
  if (iterations <= 0) return undefined;
  for (let i = loopMessages.length - 1; i >= 0; i -= 1) {
    const message = loopMessages[i];
    if (message.role !== 'assistant') continue;
    const content = typeof message.content === 'string' ? message.content.trim() : '';
    if (content.length >= 24) return content;
  }
  return undefined;
}

function safeJsonParse(raw: string): Record<string, any> {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, any>;
    }
    return {};
  } catch {
    return {};
  }
}

/**
 * Build execution prompt for ReAct loop
 */
function buildExecutionPrompt(input: PlanPhaseInput): string {
  const productDirective =
    typeof input.context_summary?.product_directive === 'string'
      ? input.context_summary.product_directive
      : '';
  const actionPlanBrief =
    typeof input.context_summary?.action_plan_session_brief === 'string'
      ? input.context_summary.action_plan_session_brief
      : '';
  const recentThreadContext =
    typeof input.context_summary?.recent_thread_context === 'string'
      ? input.context_summary.recent_thread_context
      : '';
  const activeChatId = String(
    (input.context_summary?.ui_state_snapshot as { active_chat?: { id?: string } } | undefined)
      ?.active_chat?.id ?? '',
  );
  const chat3Mode = activeChatId === 'chat-3';
  const chat2Mode = activeChatId === 'chat-2';
  const socialReflections = Array.isArray(
    (input.context_summary as { social_consciousness_reflections?: unknown })?.social_consciousness_reflections,
  )
    ? (input.context_summary as { social_consciousness_reflections: unknown[] })
        .social_consciousness_reflections
    : [];
  const uploadedDocuments = Array.isArray(input.context_summary?.uploaded_documents)
    ? input.context_summary.uploaded_documents
    : [];
  const referenceDate =
    typeof input.context_summary?.reference_date === 'string'
      ? input.context_summary.reference_date
      : new Date().toISOString().slice(0, 10);

  return `
Reference date (Chile): ${referenceDate}
User intent: ${input.classification.intent}
Mode: ${input.classification.mode}

Product directive:
${productDirective || 'No product-specific directive.'}

${
  chat2Mode || chat3Mode
    ? `Prioridad de turno:
- Responde primero lo concreto que el usuario escribio o pregunto en este mensaje.
- Justifica con evidencia verificable (presupuesto, cartola, diagnostico); declara vacios, no inventes cifras.
- Se breve: sin relleno ni repetir hipotesis o preguntas del hilo.
- Luego recopila evidencia segun la etapa del embudo.`
    : ''
}

${actionPlanBrief ? `Action plan session brief:\n${actionPlanBrief}\n` : ''}${recentThreadContext ? `${recentThreadContext}\n` : ''}
User context:
${JSON.stringify(input.context_summary, null, 2)}

Uploaded documents present: ${uploadedDocuments.length > 0 ? 'yes' : 'no'}
Rule: if uploaded_documents or consolidated_context.transactions exist, treat them as primary evidence.
Never tell the user to upload transacciones again if the context already contains their files or parsed cartolas.

${
  chat3Mode
    ? `CHAT 3 — Politica de herramientas (conciencia social):
- Prioriza reflexion socratica sobre calculo financiero.
- NO invoques finance.*, math.* ni agent.compose_pipeline salvo que el usuario pida explicitamente numeros, simulacion o marco regulatorio (CMF/SII).
- Usa rag.lookup o web.search solo como contexto filosofico/social verificable, no como meta principal.
- Si hay reflexiones del modal phi en social_consciousness_reflections, integralas con tacto.
- Detente cuando la reflexion este suficientemente anclada; la fase format escribe la respuesta final.`
    : `Grounding policy:
- Use agent.compose_pipeline for multi-step arithmetic instead of inventing numbers.
- Use finance.transactions_charts when consolidated_context.transactions.movements exist.
- Prefer market.* / web.search / rag.lookup for factual claims about Chile.
- When a tool returns ok:false, read suggested_action and retry with corrected args or another tool.
- Stop when evidence is sufficient; the format phase writes the final user-facing answer.`
}

Social reflections present: ${socialReflections.length > 0 ? 'yes' : 'no'}

Please use available tools to fulfill the user's request.
`;
}
