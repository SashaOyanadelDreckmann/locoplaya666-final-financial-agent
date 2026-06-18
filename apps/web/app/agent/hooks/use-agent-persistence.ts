'use client';

import { useCallback, useEffect, useRef } from 'react';

import { getCsrfToken } from '@/lib/sesion/csrf';
import { getSessionInfo, savePanelState, saveSheets } from '@/lib/api/cliente';
import { sanitizePanelSnapshotForSave } from '@/lib/compartido/panel-state.helpers';
import {
  bindAgentPersistenceFlush,
  type AgentPersistenceFlushPayload,
} from '../utilidades/agent-persistence-flush';
import {
  PANEL_SAVE_DEBOUNCE_MS,
  serializeChatThreadsForSave,
  SHEETS_SAVE_DEBOUNCE_MS,
  type PersistableChatThread,
} from '../utilidades/chat-sheets-persistence.helpers';
import { persistPanelState } from '../utilidades/panel-state.service';

type UseAgentPersistenceParams = {
  sheetsEnabled: boolean;
  panelEnabled: boolean;
  flushEnabled: boolean;
  panelStateBackupKey: string;
  getChatThreads: () => PersistableChatThread[];
  getPanelSnapshot: () => Record<string, unknown>;
  getSocialReflections?: () => Record<string, unknown> | null;
};

export function useAgentPersistence(params: UseAgentPersistenceParams) {
  const sheetsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightSheetsRef = useRef<Promise<unknown> | null>(null);
  const inFlightPanelRef = useRef<Promise<unknown> | null>(null);

  const buildFlushPayload = useCallback((): AgentPersistenceFlushPayload => {
    const panelSnapshot = params.getPanelSnapshot();
    return {
      sheets: serializeChatThreadsForSave(params.getChatThreads()),
      panelState: sanitizePanelSnapshotForSave(panelSnapshot),
      socialReflections: params.getSocialReflections?.() ?? null,
    };
  }, [params]);

  const persistSheetsNow = useCallback(async (options?: { force?: boolean }) => {
    if (!params.sheetsEnabled && !options?.force) return;
    if (sheetsTimerRef.current) {
      clearTimeout(sheetsTimerRef.current);
      sheetsTimerRef.current = null;
    }

    if (!getCsrfToken()) {
      await getSessionInfo().catch(() => {});
    }

    const payload = serializeChatThreadsForSave(params.getChatThreads());
    const pending = saveSheets(payload).catch(() => {});
    inFlightSheetsRef.current = pending;
    await pending;
    inFlightSheetsRef.current = null;
  }, [params]);

  const persistPanelNow = useCallback(async () => {
    if (!params.panelEnabled) return;
    if (panelTimerRef.current) {
      clearTimeout(panelTimerRef.current);
      panelTimerRef.current = null;
    }

    const snapshot = params.getPanelSnapshot();
    const pending = persistPanelState({
      panelStateBackupKey: params.panelStateBackupKey,
      snapshot: snapshot as never,
    }).catch(() => savePanelState(sanitizePanelSnapshotForSave(snapshot)));
    inFlightPanelRef.current = pending;
    await pending;
    inFlightPanelRef.current = null;
  }, [params]);

  const scheduleSheetsSave = useCallback(() => {
    if (!params.sheetsEnabled) return;
    if (sheetsTimerRef.current) clearTimeout(sheetsTimerRef.current);
    sheetsTimerRef.current = setTimeout(() => {
      void persistSheetsNow();
    }, SHEETS_SAVE_DEBOUNCE_MS);
  }, [params.sheetsEnabled, persistSheetsNow]);

  const schedulePanelSave = useCallback(() => {
    if (!params.panelEnabled) return;
    if (panelTimerRef.current) clearTimeout(panelTimerRef.current);
    panelTimerRef.current = setTimeout(() => {
      void persistPanelNow();
    }, PANEL_SAVE_DEBOUNCE_MS);
  }, [params.panelEnabled, persistPanelNow]);

  const flushNow = useCallback(async () => {
    await Promise.allSettled([persistSheetsNow(), persistPanelNow()]);
  }, [persistPanelNow, persistSheetsNow]);

  useEffect(() => {
    if (!params.flushEnabled) return;
    return bindAgentPersistenceFlush({ getPayload: buildFlushPayload });
  }, [buildFlushPayload, params.flushEnabled]);

  useEffect(
    () => () => {
      if (sheetsTimerRef.current) clearTimeout(sheetsTimerRef.current);
      if (panelTimerRef.current) clearTimeout(panelTimerRef.current);
    },
    [],
  );

  return {
    scheduleSheetsSave,
    schedulePanelSave,
    persistSheetsNow,
    persistPanelNow,
    flushNow,
  };
}
