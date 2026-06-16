'use client';

import { useCallback, useMemo, useState } from 'react';

import type { ContextConflict } from '@financial-agent/shared';
import {
  dismissContextConflict,
  listVisibleContextConflicts,
  type ContextFabricSessionView,
} from '@/lib/context/context-conflict-ui';

export function useContextConflictBanner(input: {
  contextFabric?: ContextFabricSessionView | null;
  userId?: string | null;
}) {
  const [dismissRevision, setDismissRevision] = useState(0);

  const visibleConflicts = useMemo(() => {
    void dismissRevision;
    return listVisibleContextConflicts({
      contextFabric: input.contextFabric,
      userId: input.userId,
    });
  }, [dismissRevision, input.contextFabric, input.userId]);

  const activeConflictCount = input.contextFabric?.activeConflictCount ?? 0;
  const hiddenCount = Math.max(0, activeConflictCount - visibleConflicts.length);

  const dismissConflict = useCallback(
    (conflictId: string) => {
      const contextVersion = input.contextFabric?.contextVersion;
      if (!contextVersion || !input.userId) return;
      dismissContextConflict(input.userId, contextVersion, conflictId);
      setDismissRevision((value) => value + 1);
    },
    [input.contextFabric?.contextVersion, input.userId],
  );

  const primaryConflicts: ContextConflict[] = visibleConflicts.slice(0, 1);

  return {
    shouldRender: primaryConflicts.length > 0,
    primaryConflicts,
    hiddenCount,
    dismissConflict,
  };
}
