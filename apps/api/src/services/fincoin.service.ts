import {
  buildChatClosureSummary,
  computeFincoinUsage,
  extractClosureMessagesFromTurns,
  FINCOIN_MAX_USD_SPEND,
  FINCOIN_OPERATION_COST_USD,
  type FincoinOperation,
  type FincoinUsageStatus,
  type ProductChatId,
} from '@financial-agent/shared';
import { chargeUsdSpentTotalAtomic, getUserById, patchUserRecord } from '../persistencia/repos';
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
  charged: boolean;
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

/**
 * Charge the user the exact USD cost tracked from actual LLM token usage.
 * Returns the same shape as chargeFincoinOperation for drop-in use at call sites.
 */
export async function chargeActualUsdSpent(
  userId: string,
  costUsd: number,
): Promise<FincoinChargeResult> {
  const clampedCost = Math.max(0, costUsd);
  if (clampedCost < 1e-9) {
    const user = await getUserById(userId);
    const usage = getFincoinUsageForUser(user);
    return { usage, justDepleted: false, charged: true };
  }

  const atomic = await chargeUsdSpentTotalAtomic(userId, clampedCost, FINCOIN_MAX_USD_SPEND);

  if (!atomic.charged) {
    const latestUser = await getUserById(userId);
    const usage = getFincoinUsageForUser(latestUser);
    const summaries =
      atomic.reason === 'user_not_found'
        ? undefined
        : latestUser?.fincoinDepletionHandled
          ? undefined
          : await ensureFincoinDepletionHandled(userId);
    return { usage, justDepleted: usage.depleted, charged: false, closureSummaries: summaries };
  }

  const after = computeFincoinUsage(atomic.usdSpentTotal);
  let closureSummaries: FincoinChargeResult['closureSummaries'];
  if (atomic.justDepleted) {
    closureSummaries = await ensureFincoinDepletionHandled(userId);
  }

  return { usage: after, justDepleted: atomic.justDepleted, charged: true, closureSummaries };
}

export async function chargeFincoinOperation(
  userId: string,
  operation: FincoinOperation,
): Promise<FincoinChargeResult> {
  const user = await getUserById(userId);
  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }

  const costUsd = FINCOIN_OPERATION_COST_USD[operation] ?? 0;
  const atomic = await chargeUsdSpentTotalAtomic(userId, costUsd, FINCOIN_MAX_USD_SPEND);

  if (!atomic.charged) {
    const latestUser = (await getUserById(userId)) ?? user;
    const usage = getFincoinUsageForUser(latestUser);
    const summaries =
      atomic.reason === 'user_not_found'
        ? undefined
        : user.fincoinDepletionHandled
          ? undefined
          : await ensureFincoinDepletionHandled(userId);
    return {
      usage,
      justDepleted: usage.depleted,
      charged: false,
      closureSummaries: summaries,
    };
  }

  const after = computeFincoinUsage(atomic.usdSpentTotal);
  let closureSummaries: FincoinChargeResult['closureSummaries'];
  if (atomic.justDepleted) {
    closureSummaries = await ensureFincoinDepletionHandled(userId);
  }

  return {
    usage: after,
    justDepleted: atomic.justDepleted,
    charged: true,
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
      limit: 200,
    });
    const messages = extractClosureMessagesFromTurns(turns);
    const lastTurn = turns[turns.length - 1];
    summaries[chatId] = buildChatClosureSummary({
      chatId,
      messages,
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
