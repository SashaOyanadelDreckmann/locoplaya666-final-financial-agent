'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  FINCOIN_INITIAL_BALANCE,
  FINCOIN_WARNING_THRESHOLD,
  computeFincoinUsage,
} from '@financial-agent/shared';
import { fetchFincoinUsage, type FincoinUsageApiPayload } from '@/lib/api';

export type FincoinUsageState = {
  initialFincoins: number;
  remainingFincoins: number;
  spentFincoins: number;
  depleted: boolean;
  lowBalance: boolean;
  warningThreshold: number;
  closureSummaries?: Record<string, unknown>;
};

function mapApiUsage(payload?: FincoinUsageApiPayload | null): FincoinUsageState {
  if (!payload) {
    const defaults = computeFincoinUsage(0);
    return {
      initialFincoins: defaults.initialFincoins,
      remainingFincoins: defaults.remainingFincoins,
      spentFincoins: defaults.spentFincoins,
      depleted: defaults.depleted,
      lowBalance: defaults.lowBalance,
      warningThreshold: defaults.warningThreshold,
    };
  }
  return {
    initialFincoins: payload.initial_fincoins ?? FINCOIN_INITIAL_BALANCE,
    remainingFincoins: payload.remaining_fincoins ?? FINCOIN_INITIAL_BALANCE,
    spentFincoins: payload.spent_fincoins ?? 0,
    depleted: Boolean(payload.depleted),
    lowBalance: Boolean(payload.low_balance),
    warningThreshold: payload.warning_threshold ?? FINCOIN_WARNING_THRESHOLD,
  };
}

export function useFincoinUsage(enabled: boolean) {
  const [usage, setUsage] = useState<FincoinUsageState>(() => mapApiUsage());
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
