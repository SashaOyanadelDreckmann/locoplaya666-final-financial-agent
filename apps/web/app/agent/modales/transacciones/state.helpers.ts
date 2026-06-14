'use client';

import type { BankProduct } from './types';

type AssistantState = NonNullable<BankProduct['assistant']>;

function mergeUniqueMessages(
  currentMessages: AssistantState['messages'] | undefined,
  nextMessages: AssistantState['messages'] | undefined,
) {
  const merged = new Map<string, AssistantState['messages'][number]>();
  for (const message of currentMessages ?? []) merged.set(message.id, message);
  for (const message of nextMessages ?? []) merged.set(message.id, message);
  return Array.from(merged.values());
}

export function mergeAssistantState(
  current: AssistantState | undefined,
  patch: Partial<AssistantState> | undefined,
): AssistantState | undefined {
  if (!current && !patch) return undefined;
  const hasPatch = Boolean(patch);
  const messages =
    hasPatch && patch && 'messages' in patch
      ? (patch.messages ?? [])
      : mergeUniqueMessages(current?.messages, patch?.messages);
  const pick = <K extends keyof AssistantState>(key: K, fallback: AssistantState[K]): AssistantState[K] =>
    hasPatch && patch && key in patch ? ((patch[key] ?? fallback) as AssistantState[K]) : (patch?.[key] ?? current?.[key] ?? fallback);
  return {
    messages,
    uploadFormat: pick('uploadFormat', null),
    summaryText: pick('summaryText', null),
    summaryModel: pick('summaryModel', null),
    summaryGeneratedAt: pick('summaryGeneratedAt', null),
    summaryRegenerationsUsed: pick('summaryRegenerationsUsed', 0),
    lastSummaryFeedback: pick('lastSummaryFeedback', null),
  };
}

export function mergeBankProductPatch(product: BankProduct, updates: Partial<BankProduct>): BankProduct {
  const nextAssistant = mergeAssistantState(product.assistant, updates.assistant);
  return {
    ...product,
    ...updates,
    assistant: nextAssistant,
  };
}

export function buildEvidenceResetPatch(nextResetsUsed: number): Partial<BankProduct> {
  return {
    parsedDocuments: [],
    uploadedFiles: [],
    dashboard: undefined,
    evidenceResetsUsed: nextResetsUsed,
    assistant: {
      messages: [],
      uploadFormat: null,
      summaryText: null,
      summaryModel: null,
      summaryGeneratedAt: null,
      summaryRegenerationsUsed: 0,
      lastSummaryFeedback: null,
    },
  };
}
