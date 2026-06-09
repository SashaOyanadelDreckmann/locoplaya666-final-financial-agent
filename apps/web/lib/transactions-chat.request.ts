import { alignProductDashboard } from '@/app/agent/transactions/align-product-dashboard';
import type { BankProduct } from '@/app/agent/transactions/types';
import { buildChatDashboardForQuestion, compactDashboardForPrompt } from '@/lib/transactions-chat.helpers';

export type TransactionChatContext = 'evidence_upload' | 'summary_analysis';

export type TransactionChatAssistantRequest = {
  mode: 'summary' | 'chat';
  chatContext?: TransactionChatContext;
  product: {
    bank: string;
    label: string;
    productType: BankProduct['productType'];
  };
  parsedDocuments: NonNullable<BankProduct['parsedDocuments']>;
  dashboard: unknown;
  currentSummary: string | null;
  feedback?: string;
  question?: string;
  messages?: Array<{ role?: 'assistant' | 'user'; text?: string }>;
};

export function buildTransactionChatRequest(
  product: BankProduct,
  params: {
    mode: 'summary' | 'chat';
    chatContext?: TransactionChatContext;
    question?: string;
    currentSummary?: string | null;
    feedback?: string;
    dashboard?: unknown;
    messages?: Array<{ role?: 'assistant' | 'user'; text?: string }>;
  },
): TransactionChatAssistantRequest {
  const alignedDashboard = alignProductDashboard(product) ?? product.dashboard ?? null;
  const dashboard =
    params.dashboard ??
    buildChatDashboardForQuestion(alignedDashboard, params.question ?? '') ??
    compactDashboardForPrompt(alignedDashboard, { maxMovements: 24, maxMerchants: 8 }) ??
    null;

  return {
    mode: params.mode,
    chatContext: params.chatContext ?? 'summary_analysis',
    product: {
      bank: product.bank,
      label: product.label,
      productType: product.productType,
    },
    parsedDocuments: product.parsedDocuments ?? [],
    dashboard,
    currentSummary: params.currentSummary ?? product.assistant?.summaryText ?? null,
    feedback: params.feedback ?? '',
    question: params.question ?? '',
    messages: params.messages ?? [],
  };
}
