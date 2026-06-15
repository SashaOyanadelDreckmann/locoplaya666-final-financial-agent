import {
  buildChatClosureSummary,
  computeFincoinUsage,
  FINCOIN_OPERATION_COST_USD,
  type FincoinOperation,
  type FincoinUsageStatus,
  type ProductChatId,
} from '@financial-agent/shared';
import { getUserById, patchUserRecord } from '../persistencia/repos';
import { listConversationTurns } from '../persistencia/repos/conversation.repository';
import { loadUserSheets, saveUserSheets } from './user.service';
import {
  defaultProductLifecycleState,
  getLifecycleFromMemory,
  type ProductLifecycleState,
} from './product-lifecycle.service';

export type FincoinChargeResult = {
  usage: FincoinUsageStatus;
  justDepleted: boolean;
  closureSummaries?: Partial<Record<ProductChatId, ReturnType<typeof buildChatClosureSummary>>>;
};

function readUsdSpent(user: { usdSpentTotal?: number } | null | undefined): number {
  return Math.max(0, Number(user?.usdSpentTotal ?? 0));
}

export function getFincoinUsageForUser(user: {
  usdSpentTotal?: number;
} | null | undefined): FincoinUsageStatus {
  return computeFincoinUsage(readUsdSpent(user));
}

export function canAffordOperation(
  usage: FincoinUsageStatus,
  operation: FincoinOperation,
): boolean {
  if (usage.depleted) return false;
  const costUsd = FINCOIN_OPERATION_COST_USD[operation] ?? 0;
  return usage.usdRemaining >= costUsd - 1e-9;
}

export async function chargeFincoinOperation(
  userId: string,
  operation: FincoinOperation,
): Promise<FincoinChargeResult> {
  const user = await getUserById(userId);
  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }

  const before = getFincoinUsageForUser(user);
  if (before.depleted) {
    const summaries = user.fincoinDepletionHandled
      ? undefined
      : await ensureFincoinDepletionHandled(userId);
    return { usage: before, justDepleted: false, closureSummaries: summaries };
  }

  const costUsd = FINCOIN_OPERATION_COST_USD[operation] ?? 0;
  if (!canAffordOperation(before, operation)) {
    const depletedUsage = computeFincoinUsage(before.usdSpent);
    const summaries = await ensureFincoinDepletionHandled(userId);
    return { usage: depletedUsage, justDepleted: true, closureSummaries: summaries };
  }

  const nextUsdSpent = Math.min(before.usdSpent + costUsd, before.maxUsdSpend);
  const after = computeFincoinUsage(nextUsdSpent);
  const patch: Parameters<typeof patchUserRecord>[1] = {
    usdSpentTotal: nextUsdSpent,
  };

  if (after.depleted) {
    patch.fincoinDepletedAt = new Date().toISOString();
  }

  await patchUserRecord(userId, patch);

  let closureSummaries: FincoinChargeResult['closureSummaries'];
  if (after.depleted) {
    closureSummaries = await ensureFincoinDepletionHandled(userId);
  }

  return {
    usage: after,
    justDepleted: after.depleted,
    closureSummaries,
  };
}

function resolveUnlockedChatsForDepletion(
  lifecycle: ProductLifecycleState | null,
): ProductChatId[] {
  const unlocked = lifecycle?.unlockedChats ?? defaultProductLifecycleState().unlockedChats;
  const normalized = unlocked.filter(
    (chatId): chatId is ProductChatId =>
      chatId === 'chat-1' || chatId === 'chat-2' || chatId === 'chat-3',
  );
  return normalized.length > 0 ? normalized : ['chat-1'];
}

export async function ensureFincoinDepletionHandled(
  userId: string,
): Promise<Partial<Record<ProductChatId, ReturnType<typeof buildChatClosureSummary>>>> {
  const user = await getUserById(userId);
  if (!user) return {};

  if (user.fincoinDepletionHandled) {
    return readClosureSummariesFromSheets(await loadUserSheets(userId));
  }

  const lifecycle = getLifecycleFromMemory(user.memoryBlob);
  const targetChats = resolveUnlockedChatsForDepletion(lifecycle);
  const summaries: Partial<Record<ProductChatId, ReturnType<typeof buildChatClosureSummary>>> = {};

  for (const chatId of targetChats) {
    const turns = await listConversationTurns({
      userId,
      chatId,
      limit: 1,
    });
    const lastTurn = turns[0];
    summaries[chatId] = buildChatClosureSummary({
      chatId,
      userMessage: lastTurn?.userMessage,
      assistantMessage: lastTurn?.assistantMessage,
      turnsRemaining: 0,
    });
  }

  const currentSheets = (await loadUserSheets(userId)) ?? [];
  const nextSheets = currentSheets.map((sheet) => {
    const summary = summaries[sheet.id as ProductChatId];
    if (!summary) return sheet;
    return {
      ...sheet,
      closureSummary: summary,
      completedAt: sheet.completedAt ?? new Date().toISOString(),
      status: 'context' as const,
    };
  });

  for (const chatId of targetChats) {
    if (nextSheets.some((sheet) => sheet.id === chatId)) continue;
    const summary = summaries[chatId];
    if (!summary) continue;
    nextSheets.push({
      id: chatId,
      name:
        chatId === 'chat-2'
          ? 'Plan post-diagnóstico'
          : chatId === 'chat-3'
            ? 'Conciencia social'
            : 'Diagnóstico financiero',
      autoNamed: true,
      items: [],
      draft: '',
      status: 'context',
      userMessageCount: 0,
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      closureSummary: summary,
    });
  }

  await saveUserSheets(userId, nextSheets);
  await patchUserRecord(userId, {
    fincoinDepletionHandled: true,
    fincoinDepletedAt: user.fincoinDepletedAt ?? new Date().toISOString(),
  });

  return summaries;
}

function readClosureSummariesFromSheets(
  sheets: Awaited<ReturnType<typeof loadUserSheets>>,
): Partial<Record<ProductChatId, ReturnType<typeof buildChatClosureSummary>>> {
  if (!sheets) return {};
  const out: Partial<Record<ProductChatId, ReturnType<typeof buildChatClosureSummary>>> = {};
  for (const sheet of sheets) {
    if (
      (sheet.id === 'chat-1' || sheet.id === 'chat-2' || sheet.id === 'chat-3') &&
      sheet.closureSummary &&
      typeof sheet.closureSummary === 'object'
    ) {
      out[sheet.id] = sheet.closureSummary as ReturnType<typeof buildChatClosureSummary>;
    }
  }
  return out;
}

/** Client-safe payload: Fincoins only (USD economics stay server-side). */
export function fincoinUsagePayload(usage: FincoinUsageStatus) {
  return {
    initial_fincoins: usage.initialFincoins,
    remaining_fincoins: usage.remainingFincoins,
    spent_fincoins: usage.spentFincoins,
    depleted: usage.depleted,
    low_balance: usage.lowBalance,
    warning_threshold: usage.warningThreshold,
  };
}
