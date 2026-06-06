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
  return {
    messages: mergeUniqueMessages(current?.messages, patch?.messages),
    uploadFormat: patch?.uploadFormat ?? current?.uploadFormat ?? null,
    summaryText: patch?.summaryText ?? current?.summaryText ?? null,
    summaryModel: patch?.summaryModel ?? current?.summaryModel ?? null,
    summaryGeneratedAt: patch?.summaryGeneratedAt ?? current?.summaryGeneratedAt ?? null,
    summaryRegenerationsUsed: patch?.summaryRegenerationsUsed ?? current?.summaryRegenerationsUsed ?? 0,
    lastSummaryFeedback: patch?.lastSummaryFeedback ?? current?.lastSummaryFeedback ?? null,
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
