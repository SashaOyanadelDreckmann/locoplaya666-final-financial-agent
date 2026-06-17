'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  detectPwaInstallPlatform,
  dismissPwaInstallNotice,
  getPwaInstallGuide,
  isPwaStandaloneMode,
  isSafariBrowser,
  resolvePwaInstallPrimaryLabel,
  resolvePwaInstallStatusMessage,
  runPwaInstallPrimaryAction,
  shouldRenderPwaInstallNotice,
  shouldShowPwaInstallPrimaryAction,
  type DeferredInstallPrompt,
  type PwaInstallPlatform,
  type PwaInstallState,
} from '@/lib/interfaz/pwa-install.helpers';

export function usePwaInstallNotice(input: {
  userId?: string | null;
  authBootstrapped: boolean;
  isAuthenticated: boolean;
  isStandalone: boolean;
  activeChatId: string;
  chatClosed?: boolean;
  compactClosedView?: boolean;
  loading?: boolean;
  bootSequenceActive?: boolean;
}) {
  const [dismissRevision, setDismissRevision] = useState(0);
  const [platform, setPlatform] = useState<PwaInstallPlatform>('unknown');
  const [isSafari, setIsSafari] = useState(false);
  const [standalone, setStandalone] = useState(input.isStandalone);
  const [deferredPrompt, setDeferredPrompt] = useState<DeferredInstallPrompt | null>(null);
  const [installState, setInstallState] = useState<PwaInstallState>('idle');

  useEffect(() => {
    setPlatform(detectPwaInstallPlatform());
    setIsSafari(isSafariBrowser());
    setStandalone(isPwaStandaloneMode() || input.isStandalone);
  }, [input.isStandalone]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as DeferredInstallPrompt);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const shouldRender = useMemo(() => {
    void dismissRevision;
    return shouldRenderPwaInstallNotice({
      userId: input.userId,
      authBootstrapped: input.authBootstrapped,
      isAuthenticated: input.isAuthenticated,
      isStandalone: standalone,
      activeChatId: input.activeChatId,
      chatClosed: input.chatClosed,
      compactClosedView: input.compactClosedView,
      loading: input.loading,
      bootSequenceActive: input.bootSequenceActive,
    });
  }, [
    dismissRevision,
    input.activeChatId,
    input.authBootstrapped,
    input.bootSequenceActive,
    input.chatClosed,
    input.compactClosedView,
    input.isAuthenticated,
    input.loading,
    input.userId,
    standalone,
  ]);

  const guide = useMemo(() => getPwaInstallGuide(platform), [platform]);

  const showPrimaryAction = shouldShowPwaInstallPrimaryAction({
    standalone,
    installState,
    platform,
    hasDeferredPrompt: Boolean(deferredPrompt),
  });

  const primaryLabel = resolvePwaInstallPrimaryLabel({
    hasDeferredPrompt: Boolean(deferredPrompt),
    guide,
  });

  const statusMessage = resolvePwaInstallStatusMessage({ standalone, installState });

  const dismissNotice = useCallback(() => {
    dismissPwaInstallNotice(input.userId);
    setDismissRevision((value) => value + 1);
  }, [input.userId]);

  const runPrimaryAction = useCallback(async () => {
    const nextState = await runPwaInstallPrimaryAction({
      deferredPrompt,
      platform,
      isSafari,
    });
    setInstallState(nextState);
    if (deferredPrompt) {
      setDeferredPrompt(null);
    }
    if (nextState === 'accepted') {
      dismissPwaInstallNotice(input.userId);
      setDismissRevision((value) => value + 1);
    }
  }, [deferredPrompt, input.userId, isSafari, platform]);

  return {
    shouldRender,
    guide,
    platform,
    showPrimaryAction,
    primaryLabel,
    statusMessage,
    dismissNotice,
    runPrimaryAction,
  };
}
