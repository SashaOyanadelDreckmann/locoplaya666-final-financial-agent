import { compactCoreAgentHistory, resolveCoreAgentHistoryLimits, resolveUserMessageForAgentHistory } from '@financial-agent/shared';

import type { SocialReflectionSession } from '@/lib/agente/nucleo/social-consciousness-reflections';

import type { AgentBlock } from '@/lib/tipos/chat';
import type { ChatItem } from '@/lib/agente/agent.response.types';
import { isWelcomeShellMessageContent } from '@/app/agent/flujo/welcome-intro.shared';
import { buildScopedTransactionsContext } from '@/lib/compartido/products-context.helpers';
import type { BankProduct, TransactionTaxonomyOverride } from '@/app/agent/modales/transacciones/types';

import type { BudgetRow } from '@/lib/presupuesto/filas.helpers';

export type CoreAgentBudgetRow = Pick<
  BudgetRow,
  'id' | 'category' | 'type' | 'amount' | 'note' | 'cadence' | 'paymentMethod' | 'movementType'
>;

export type CoreAgentRequestContext = {
  items: ChatItem[];
  activeChatId: string;
  activeThread?: { id: string; label: string; name: string };
  panelStage: number | string;
  isPanelCollapsed: boolean;
  products: BankProduct[];
  activeProductId: string | null;
  taxonomyOverrides: TransactionTaxonomyOverride[];
  budgetRows: CoreAgentBudgetRow[];
  budgetTotals: { income: number; expenses: number; balance: number };
  unlockedPanelBlocks: {
    budgetUnlocked: boolean;
    transactionsUnlocked: boolean;
  };
  canOpenInterview: boolean;
  interviewCompleted: boolean;
  knowledgeScore: number;
  engagementScore: number;
  completedMilestones: number;
  milestones: Array<{ id: string; label: string; done: boolean }>;
  savedReportsCount: number;
  hasProfile: boolean;
  hasIntake: boolean;
  flowStatus: Record<string, unknown>;
  productTurnCount?: number;
  productTurnsRemaining?: number;
  productClosingMode?: boolean;
  socialReflectionSession?: SocialReflectionSession | null;
};

export function buildCoreAgentHistorySnapshot(items: ChatItem[], activeChatId?: string) {
  const limits = resolveCoreAgentHistoryLimits(activeChatId);
  return compactCoreAgentHistory(
    items
      .filter((item) => {
        if (item.type !== 'message') return false;
        const message = item as Extract<ChatItem, { type: 'message' }>;
        const content = String(message.content ?? '').trim();
        if (!content) return false;
        if (message.role === 'assistant' && message.stream?.streaming) return false;
        if (message.role === 'assistant' && isWelcomeShellMessageContent(content)) return false;
        return true;
      })
      .map((item) => {
        const message = item as Extract<ChatItem, { type: 'message' }>;
        return {
          role: message.role,
          content:
            message.role === 'user'
              ? resolveUserMessageForAgentHistory({
                  content: message.content,
                  agent_content: message.agent_content,
                })
              : message.content,
        };
      }),
    {
      maxMessages: limits.maxMessages,
      maxCharsPerMessage: limits.maxCharsPerMessage,
    },
  );
}

export function buildRecentArtifactsFromItems(items: ChatItem[]) {
  return items
    .filter((item) => item.type === 'artifact')
    .slice(-4)
    .map((item) => {
      const artifact = (item as Extract<ChatItem, { type: 'artifact' }>).artifact;
      return {
        id: artifact.id,
        title: artifact.title,
        description: artifact.description,
        source: artifact.source,
        createdAt: artifact.createdAt,
        meta: artifact.meta,
      };
    });
}

export function buildRecentChartSummariesFromItems(items: ChatItem[]) {
  return items
    .filter((item) => item.type === 'message' && item.role === 'assistant')
    .slice(-6)
    .flatMap((item) => {
      const blocks =
        (item as Extract<ChatItem, { type: 'message'; role: 'assistant' }>).agent_blocks ?? [];
      return blocks
        .flatMap((block) => {
          if (block.type === 'chart') {
            return [{
              title: block.chart.title,
              subtitle: block.chart.subtitle,
              kind: block.chart.kind,
              xKey: block.chart.xKey,
              yKey: block.chart.yKey,
              points: Array.isArray(block.chart.data) ? block.chart.data.length : 0,
              lastValue:
                Array.isArray(block.chart.data) && block.chart.data.length > 0
                  ? Number(
                      block.chart.data[block.chart.data.length - 1]?.[
                        block.chart.yKey as keyof (typeof block.chart.data)[number]
                      ] ?? 0,
                    )
                  : undefined,
            }];
          }
          if (block.type === 'tx_chart') {
            if (block.tx_chart.variant === 'cumulative_cashflow') {
              const lastPoint = block.tx_chart.series.points.at(-1);
              return [{
                title: block.tx_chart.title ?? block.tx_chart.series.monthLabel,
                subtitle: block.tx_chart.subtitle,
                kind: 'tx_cumulative_cashflow',
                xKey: 'dayLabel',
                yKey: 'cumulativeIncome',
                points: block.tx_chart.series.points.length,
                lastValue: lastPoint?.cumulativeIncome,
              }];
            }
            return [{
              title: block.tx_chart.title ?? block.tx_chart.variant,
              subtitle: block.tx_chart.subtitle,
              kind: `tx_${block.tx_chart.variant}`,
              xKey: 'metric',
              yKey: 'value',
              points: 'data' in block.tx_chart ? block.tx_chart.data.length : 0,
            }];
          }
          return [];
        });
    })
    .slice(-4);
}

export function enrichUserMessageWithChartContext(
  agentMessage: string,
  recentChartSummaries: ReturnType<typeof buildRecentChartSummariesFromItems>,
): string {
  const asksToExplainChart =
    /\b(explica|explicar|interpreta|interpretar|lee|analiza|comenta|desglosa)\b[\s\S]*\b(gr[aá]fic(?:o|os)|chart(?:s)?)\b/i.test(
      agentMessage,
    ) || /\b(gr[aá]fic(?:o|os)|chart(?:s)?)\b/i.test(agentMessage);

  if (!asksToExplainChart || recentChartSummaries.length === 0) return agentMessage;

  return `${agentMessage}\n\nContexto del último gráfico en chat: ${JSON.stringify(
    recentChartSummaries.slice(-1)[0],
  )}`;
}

/** Lightweight payload for mobile Safari — server hydrates products/budget from session. */
export function buildSlimCoreAgentSendPayload(
  context: CoreAgentRequestContext,
  params: {
    userMessage: string;
    agentMessage: string;
    sessionId: string;
    clientMessageId: string;
  },
) {
  const historySnapshot = buildCoreAgentHistorySnapshot(context.items, context.activeChatId);
  const enrichedUserMessage = enrichUserMessageWithChartContext(
    params.agentMessage,
    buildRecentChartSummariesFromItems(context.items),
  );

  return {
    user_message: enrichedUserMessage,
    session_id: params.sessionId,
    client_message_id: params.clientMessageId,
    history: historySnapshot,
    context: {
      client_hydrate: true,
    },
    ui_state: {
      panel_stage: context.panelStage,
      panel_collapsed: context.isPanelCollapsed,
      active_chat: {
        id: context.activeThread?.id ?? context.activeChatId,
        label: context.activeThread?.label ?? 'Core',
        name: context.activeThread?.name ?? 'Diagnóstico financiero',
      },
      unlocked_modules: {
        budget: context.unlockedPanelBlocks.budgetUnlocked,
        transactions: context.unlockedPanelBlocks.transactionsUnlocked,
        interview: context.canOpenInterview,
        post_diagnosis_chats: context.interviewCompleted,
      },
      budget_summary: {
        income: context.budgetTotals.income,
        expenses: context.budgetTotals.expenses,
        balance: context.budgetTotals.balance,
        rows_count: context.budgetRows.filter((row) => row.amount > 0).length,
      },
      product_turn_count: context.productTurnCount,
      product_turns_remaining: context.productTurnsRemaining,
      product_closing_mode: context.productClosingMode === true,
    },
    _meta: {
      displayUserMessage: params.userMessage,
    },
  };
}

export function buildCoreAgentSendPayload(
  context: CoreAgentRequestContext,
  params: {
    userMessage: string;
    agentMessage: string;
    sessionId: string;
    clientMessageId: string;
  },
) {
  const historySnapshot = buildCoreAgentHistorySnapshot(context.items, context.activeChatId);
  const recentArtifacts = buildRecentArtifactsFromItems(context.items);
  const recentChartSummaries = buildRecentChartSummariesFromItems(context.items);
  const enrichedUserMessage = enrichUserMessageWithChartContext(
    params.agentMessage,
    recentChartSummaries,
  );

  const scopedTxContext = buildScopedTransactionsContext(
    context.products,
    context.activeProductId,
    context.taxonomyOverrides,
  );

  return {
    user_message: enrichedUserMessage,
    session_id: params.sessionId,
    client_message_id: params.clientMessageId,
    history: historySnapshot,
    context: {
      recent_artifacts: recentArtifacts,
      recent_chart_summaries: recentChartSummaries,
      social_consciousness_reflections: context.socialReflectionSession?.answers ?? [],
      uploaded_documents: scopedTxContext.scopedUploadedDocuments,
      uploaded_evidence_files: scopedTxContext.scopedUploadedEvidenceFiles,
      consolidated_context: {
        transactions: {
          scope: 'active_product',
          activeProductId: scopedTxContext.activeProduct?.id ?? null,
          activeProductLabel: scopedTxContext.activeProduct?.label ?? null,
          activeProductBank: scopedTxContext.activeProduct?.bank ?? null,
          activeProductType: scopedTxContext.activeProduct?.productType ?? null,
          connected: Boolean(scopedTxContext.activeProduct?.connected),
          productsCount: context.products.length,
          uploadedFiles: scopedTxContext.scopedUploadedEvidenceFiles,
          productsIndex: scopedTxContext.productsIndex,
          activeProduct: scopedTxContext.activeProduct
            ? {
                id: scopedTxContext.activeProduct.id,
                label: scopedTxContext.activeProduct.label,
                bank: scopedTxContext.activeProduct.bank,
                productType: scopedTxContext.activeProduct.productType,
                dashboardSummary: scopedTxContext.activeProduct.dashboard?.summary ?? '',
                keyMetrics: scopedTxContext.activeProduct.dashboard?.keyMetrics ?? null,
                movements:
                  scopedTxContext.activeProduct.dashboard?.movements?.slice(0, 40) ?? [],
              }
            : null,
        },
      },
    },
    ui_state: {
      panel_stage: context.panelStage,
      panel_collapsed: context.isPanelCollapsed,
      active_chat: {
        id: context.activeThread?.id ?? context.activeChatId,
        label: context.activeThread?.label ?? 'Core',
        name: context.activeThread?.name ?? 'Diagnóstico financiero',
      },
      unlocked_modules: {
        budget: context.unlockedPanelBlocks.budgetUnlocked,
        transactions: context.unlockedPanelBlocks.transactionsUnlocked,
        interview: context.canOpenInterview,
        post_diagnosis_chats: context.interviewCompleted,
      },
      knowledge_score: context.knowledgeScore,
      engagement_score: context.engagementScore,
      completed_milestones: context.completedMilestones,
      total_milestones: context.milestones.length,
      milestone_details: context.milestones.map((milestone) => ({
        id: milestone.id,
        label: milestone.label,
        done: milestone.done,
      })),
      reports_count: context.savedReportsCount,
      has_profile: context.hasProfile,
      has_intake: context.hasIntake,
      budget_summary: {
        income: context.budgetTotals.income,
        expenses: context.budgetTotals.expenses,
        balance: context.budgetTotals.balance,
        rows_count: context.budgetRows.filter((row) => row.amount > 0).length,
      },
      budget_rows: context.budgetRows
        .filter((row) => row.amount > 0 || row.category.trim().length > 0)
        .slice(0, 30)
        .map((row) => ({
          id: row.id,
          category: row.category,
          type: row.type,
          amount: row.amount,
          note: row.note,
          cadence: row.cadence === 'fixed' || row.cadence === 'variable' ? row.cadence : undefined,
          paymentMethod: row.paymentMethod,
          movementType: row.movementType,
        })),
      product_turn_count:
        typeof context.productTurnCount === 'number' ? context.productTurnCount : undefined,
      product_turns_remaining:
        typeof context.productTurnsRemaining === 'number' ? context.productTurnsRemaining : undefined,
      product_closing_mode: context.productClosingMode === true,
      flow_status: context.flowStatus,
    },
    preferences: {
      response_style: 'professional',
      language: 'es-CL',
    },
    _meta: {
      displayUserMessage: params.userMessage,
    },
  };
}
