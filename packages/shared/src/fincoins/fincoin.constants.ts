/** Per-model pricing in USD per 1 million tokens (input / output). */
export const LLM_MODEL_PRICING_PER_1M: Record<string, { input: number; output: number }> = {
  // OpenAI GPT-5 family
  'gpt-5': { input: 15.0, output: 60.0 },
  'gpt-5.2': { input: 15.0, output: 60.0 },
  // OpenAI GPT-4.1 family
  'gpt-4.1': { input: 2.0, output: 8.0 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'gpt-4.1-nano': { input: 0.1, output: 0.4 },
  // OpenAI GPT-4o family
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  // Anthropic Claude 4 family
  'claude-opus-4-8': { input: 15.0, output: 75.0 },
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  'claude-haiku-4-5': { input: 0.8, output: 4.0 },
  'claude-haiku-4-5-20251001': { input: 0.8, output: 4.0 },
};

/** Conservative fallback when the model is not in the pricing table. */
export const LLM_PRICING_FALLBACK_PER_1M = { input: 5.0, output: 20.0 };

/** Returns the USD cost for a specific model and token counts. */
export function computeLLMTokenCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const normalizedModel = model.trim().toLowerCase();
  const pricing =
    LLM_MODEL_PRICING_PER_1M[normalizedModel] ??
    // prefix match: e.g. "gpt-4o-mini-2024-07-18" → "gpt-4o-mini"
    Object.entries(LLM_MODEL_PRICING_PER_1M).find(([k]) => normalizedModel.startsWith(k))?.[1] ??
    LLM_PRICING_FALLBACK_PER_1M;
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}

export const FINCOIN_INITIAL_BALANCE = 250;
export const FINCOIN_WARNING_THRESHOLD = 50;
/** Display budget: 250 fincoins represent this USD value. */
export const FINCOIN_BUDGET_USD = 1.6;
/** Hard per-user spend ceiling (backend enforced). */
export const FINCOIN_MAX_USD_SPEND = 2.0;

export const FINCOIN_USD_PER_COIN = FINCOIN_BUDGET_USD / FINCOIN_INITIAL_BALANCE;

export type FincoinOperation =
  | 'agent.chat'
  | 'budget.chat'
  | 'transactions.chat'
  | 'transcribe'
  | 'voice.realtime'
  | 'document.parse'
  | 'intake.llm'
  | 'welcome.llm'
  | 'conversation.voice';

export const FINCOIN_OPERATION_COST_USD: Record<FincoinOperation, number> = {
  'agent.chat': 0.04,
  'budget.chat': 0.03,
  'transactions.chat': 0.03,
  transcribe: 0.04,
  'voice.realtime': 0.12,
  'document.parse': 0.06,
  'intake.llm': 0.02,
  'welcome.llm': 0.02,
  'conversation.voice': 0.08,
};

export type FincoinUsageStatus = {
  initialFincoins: number;
  remainingFincoins: number;
  spentFincoins: number;
  budgetUsd: number;
  maxUsdSpend: number;
  usdSpent: number;
  usdRemaining: number;
  depleted: boolean;
  lowBalance: boolean;
  warningThreshold: number;
};

export function fincoinsFromUsd(usd: number): number {
  if (!Number.isFinite(usd) || usd <= 0) return 0;
  return Math.ceil(usd / FINCOIN_USD_PER_COIN);
}

export function usdFromFincoins(coins: number): number {
  if (!Number.isFinite(coins) || coins <= 0) return 0;
  return coins * FINCOIN_USD_PER_COIN;
}

export function computeFincoinUsage(usdSpentRaw: number): FincoinUsageStatus {
  const usdSpent = Math.max(0, Number(usdSpentRaw) || 0);
  const usdRemaining = Math.max(0, FINCOIN_MAX_USD_SPEND - usdSpent);
  const remainingFincoins = Math.min(
    FINCOIN_INITIAL_BALANCE,
    Math.floor(usdRemaining / FINCOIN_USD_PER_COIN),
  );
  const spentFincoins = Math.max(0, FINCOIN_INITIAL_BALANCE - remainingFincoins);
  const depleted = remainingFincoins <= 0 || usdSpent >= FINCOIN_MAX_USD_SPEND - 1e-9;
  const lowBalance = !depleted && remainingFincoins <= FINCOIN_WARNING_THRESHOLD;

  return {
    initialFincoins: FINCOIN_INITIAL_BALANCE,
    remainingFincoins,
    spentFincoins,
    budgetUsd: FINCOIN_BUDGET_USD,
    maxUsdSpend: FINCOIN_MAX_USD_SPEND,
    usdSpent: Math.min(usdSpent, FINCOIN_MAX_USD_SPEND),
    usdRemaining,
    depleted,
    lowBalance,
    warningThreshold: FINCOIN_WARNING_THRESHOLD,
  };
}
