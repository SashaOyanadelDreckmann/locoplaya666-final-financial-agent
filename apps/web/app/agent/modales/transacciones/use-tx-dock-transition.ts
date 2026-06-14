'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TxDockTransitionPhase } from './presentation';
import type { BankProduct, TxWizardStep } from './types';

type ProductCard = {
  product: BankProduct;
};

export function useTxDockTransition(params: {
  isOpen: boolean;
  txWizardStep: TxWizardStep;
  activeBankProduct: BankProduct | null;
  canContinueAuto: boolean;
  resolvedBank: string;
  resolvedProductLabel: string;
  derivedProductType: BankProduct['productType'];
  consentIsGranted: boolean;
  applyOnboarding: () => void;
  simulateBankLogin: (config?: {
    bank?: string;
    label?: string;
    productType?: BankProduct['productType'];
    simulationAccepted?: boolean;
  }) => boolean;
  maybeInitAssistant: () => void;
  setShowTxCarousel: (value: boolean) => void;
  productCards: ProductCard[];
}) {
  const {
    isOpen,
    txWizardStep,
    activeBankProduct,
    canContinueAuto,
    resolvedBank,
    resolvedProductLabel,
    derivedProductType,
    consentIsGranted,
    applyOnboarding,
    simulateBankLogin,
    maybeInitAssistant,
    setShowTxCarousel,
    productCards,
  } = params;

  const [shuffleTrigger, setShuffleTrigger] = useState(0);
  const [recentlyDockedProductId, setRecentlyDockedProductId] = useState<string | null>(null);
  const [isDockingToLibrary, setIsDockingToLibrary] = useState(false);
  const [dockTransitionPhase, setDockTransitionPhase] = useState<TxDockTransitionPhase>('idle');
  const [transitionPulse, setTransitionPulse] = useState(0);
  const dockTransitionTimersRef = useRef<number[]>([]);
  const recentlyDockedResetTimerRef = useRef<number | null>(null);
  const previousConnectedRef = useRef<Record<string, boolean>>({});

  const clearDockTransitionTimers = useCallback(() => {
    dockTransitionTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    dockTransitionTimersRef.current = [];
    if (recentlyDockedResetTimerRef.current !== null) {
      window.clearTimeout(recentlyDockedResetTimerRef.current);
      recentlyDockedResetTimerRef.current = null;
    }
  }, []);

  const queueDockTransitionTimeout = useCallback((callback: () => void, delay: number) => {
    const timerId = window.setTimeout(callback, delay);
    dockTransitionTimersRef.current.push(timerId);
  }, []);

  const bumpTransitionPulse = useCallback(() => {
    setTransitionPulse((value) => value + 1);
  }, []);

  const bumpModalMotion = useCallback(() => {
    setShuffleTrigger((value) => value + 1);
    bumpTransitionPulse();
  }, [bumpTransitionPulse]);

  const startAuthorizationTransition = useCallback(() => {
    if (!canContinueAuto || isDockingToLibrary || !activeBankProduct) return;
    clearDockTransitionTimers();
    const productId = activeBankProduct.id;

    applyOnboarding();
    const authorized = simulateBankLogin({
      bank: resolvedBank,
      label: resolvedProductLabel,
      productType: derivedProductType,
      simulationAccepted: consentIsGranted,
    });
    if (!authorized) {
      setIsDockingToLibrary(false);
      setDockTransitionPhase('idle');
      return;
    }

    setRecentlyDockedProductId(productId);
    setIsDockingToLibrary(true);
    setDockTransitionPhase('authorizing');
    bumpModalMotion();
    setShowTxCarousel(true);
    queueDockTransitionTimeout(() => setDockTransitionPhase('flood'), 220);
    queueDockTransitionTimeout(() => {
      setDockTransitionPhase('library-reveal');
      setShuffleTrigger((value) => value + 1);
    }, 520);
    queueDockTransitionTimeout(() => {
      setDockTransitionPhase('chat-reveal');
      setShuffleTrigger((value) => value + 1);
      maybeInitAssistant();
    }, 800);
    queueDockTransitionTimeout(() => {
      setIsDockingToLibrary(false);
      setRecentlyDockedProductId((current) => (current === productId ? null : current));
    }, 1440);
  }, [
    activeBankProduct,
    applyOnboarding,
    bumpModalMotion,
    canContinueAuto,
    clearDockTransitionTimers,
    consentIsGranted,
    derivedProductType,
    isDockingToLibrary,
    maybeInitAssistant,
    queueDockTransitionTimeout,
    resolvedBank,
    resolvedProductLabel,
    setShowTxCarousel,
    simulateBankLogin,
  ]);

  useEffect(() => {
    if (!isOpen) {
      clearDockTransitionTimers();
      setDockTransitionPhase('idle');
      setIsDockingToLibrary(false);
      setShowTxCarousel(false);
      return;
    }
    const hasPendingAuthorization = Boolean(activeBankProduct) && !activeBankProduct?.connected;
    setShowTxCarousel(txWizardStep !== 'products' || hasPendingAuthorization);
  }, [activeBankProduct, clearDockTransitionTimers, isOpen, setShowTxCarousel, txWizardStep]);

  useEffect(() => {
    if (!isOpen) return;
    setDockTransitionPhase('idle');
    setIsDockingToLibrary(false);
  }, [activeBankProduct?.id, isOpen]);

  useEffect(() => {
    const nextMap: Record<string, boolean> = {};
    productCards.forEach(({ product }) => {
      nextMap[product.id] = Boolean(product.connected);
      if (!previousConnectedRef.current[product.id] && product.connected) {
        setRecentlyDockedProductId(product.id);
        if (recentlyDockedResetTimerRef.current !== null) {
          window.clearTimeout(recentlyDockedResetTimerRef.current);
        }
        recentlyDockedResetTimerRef.current = window.setTimeout(() => {
          setRecentlyDockedProductId((current) => (current === product.id ? null : current));
          recentlyDockedResetTimerRef.current = null;
        }, 900);
      }
    });
    previousConnectedRef.current = nextMap;
  }, [productCards]);

  useEffect(() => {
    if (!isOpen) {
      clearDockTransitionTimers();
      setIsDockingToLibrary(false);
      setDockTransitionPhase('idle');
    }
  }, [clearDockTransitionTimers, isOpen]);

  useEffect(() => () => clearDockTransitionTimers(), [clearDockTransitionTimers]);

  return {
    shuffleTrigger,
    recentlyDockedProductId,
    isDockingToLibrary,
    dockTransitionPhase,
    transitionPulse,
    bumpModalMotion,
    bumpTransitionPulse,
    startAuthorizationTransition,
  };
}
