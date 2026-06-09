'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  FINCOIN_INITIAL_BALANCE,
  FINCOIN_WARNING_THRESHOLD,
  type FincoinUsageStatus,
  computeFincoinUsage,
} from '@financial-agent/shared';
import { fetchFincoinUsage, type FincoinUsageApiPayload } from '@/lib/api';

export type FincoinUsageState = FincoinUsageStatus & {
  closureSummaries?: Record<string, unknown>;
};

function mapApiUsage(payload?: FincoinUsageApiPayload | null): FincoinUsageState {
  if (!payload) {
    return computeFincoinUsage(0);
  }
  return {
    initialFincoins: payload.initial_fincoins ?? FINCOIN_INITIAL_BALANCE,
    remainingFincoins: payload.remaining_fincoins ?? FINCOIN_INITIAL_BALANCE,
    spentFincoins: payload.spent_fincoins ?? 0,
    budgetUsd: payload.budget_usd ?? 1.6,
    maxUsdSpend: payload.max_usd_spend ?? 2,
    usdSpent: payload.usd_spent ?? 0,
    usdRemaining: payload.usd_remaining ?? 2,
    depleted: Boolean(payload.depleted),
    lowBalance: Boolean(payload.low_balance),
    warningThreshold: payload.warning_threshold ?? FINCOIN_WARNING_THRESHOLD,
  };
}

export function useFincoinUsage(enabled: boolean) {
  const [usage, setUsage] = useState<FincoinUsageState>(() => computeFincoinUsage(0));
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const data = await fetchFincoinUsage();
      setUsage({
        ...mapApiUsage(data.usage),
        closureSummaries: data.closure_summaries,
      });
    } catch {
      // Keep last known usage on transient failures.
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  const applyUsagePayload = useCallback((payload?: FincoinUsageApiPayload | null) => {
    if (!payload) return;
    setUsage((prev) => ({
      ...mapApiUsage(payload),
      closureSummaries: prev.closureSummaries,
    }));
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
  }, [enabled, refresh]);

  return {
    usage,
    loading,
    refresh,
    applyUsagePayload,
    isDepleted: usage.depleted,
    isLowBalance: usage.lowBalance && !usage.depleted,
  };
}
