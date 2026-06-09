'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CHILE_FINANCIAL_INSTITUTIONS } from '@/lib/financialCatalog';
import {
  buildTransactionAuthorizationBlockMessage,
  deriveTransactionAuthorizationState,
} from '@/lib/transactions-authorization.helpers';
import { MAX_TRANSACTION_PRODUCTS_CREATED_TOTAL } from '../agent-page.constants';
import {
  ALL_PRODUCT_TEMPLATES,
  TX_CATEGORY_OPTIONS,
  PRODUCT_STACK_PALETTE,
  PRODUCT_STACK_TEXT_PALETTE,
} from './constants';
import { assignUniquePaletteIndices } from './library-stack.helpers';
import { useMovementAnalytics } from './use-movement-analytics';
import { usePrefersReducedMotion } from './use-prefers-reduced-motion';
import { useTxAssistantChat } from './use-tx-assistant-chat';
import { useTxCloseConfirm } from './use-tx-close-confirm';
import { useTxDockTransition } from './use-tx-dock-transition';
import { useTxModalA11y } from './use-tx-modal-a11y';
import { useTxModalScrollLock } from './use-tx-modal-scroll';
import {
  buildTxStages,
  deriveActiveTxStageIndex,
  deriveCurrentStage,
} from './tx-wizard.helpers';
import { movementOverrideKey } from './taxonomy';
import type { BankProduct, TransactionsModalProps } from './types';
import {
  buildMovementRefinementText,
  isCardLikeType,
  RECOMMENDED_TX_PRODUCTS,
} from './transactions-modal.helpers';
import { resolveAnalystExperienceState } from './analyst-experience.helpers';
import { readProductEvidenceFidelity } from '@/lib/evidence-fidelity.helpers';
import { productVisualPalette } from './visuals';
import { normalizeUploadFormat } from './tx-assistant.helpers';

export function useTransactionsModalOrchestrator(props: TransactionsModalProps) {
  const onContinueWithoutProducts = props.productsModuleSkipped
    ? undefined
    : props.onContinueWithoutProducts;
  const maxEvidenceResets = props.maxEvidenceResets ?? 3;

  const [consentAccepted, setConsentAccepted] = useState(false);
  const [selectedMovementKey, setSelectedMovementKey] = useState<string | null>(null);
  const [overrideMerchantDraft, setOverrideMerchantDraft] = useState('');
  const [overrideCategoryDraft, setOverrideCategoryDraft] = useState<string>(TX_CATEGORY_OPTIONS[0]);
  const [showAllMovements, setShowAllMovements] = useState(false);
  const [execTab, setExecTab] = useState<'summary' | 'metrics'>('summary');
  const [quickBank, setQuickBank] = useState('');
  const [productTemplate, setProductTemplate] = useState('');
  const [showInstitutionCatalog, setShowInstitutionCatalog] = useState(false);
  const [showTemplateCatalog, setShowTemplateCatalog] = useState(false);
  const [showTxCarousel, setShowTxCarousel] = useState(false);
  const [txSummaryScrollDepth, setTxSummaryScrollDepth] = useState(0);
  const [productCarouselIndex, setProductCarouselIndex] = useState(0);
  const [carouselPaused, setCarouselPaused] = useState(false);
  const [evidenceResetConfirmOpen, setEvidenceResetConfirmOpen] = useState(false);

  const transactionsModalRef = useRef<HTMLDivElement | null>(null);
  const txScrollBodyRef = useRef<HTMLDivElement | null>(null);
  const txChatThreadRef = useRef<HTMLDivElement | null>(null);
  const groupCarouselRef = useRef<HTMLDivElement | null>(null);
  const insightCarouselRef = useRef<HTMLDivElement | null>(null);
  const txSummaryScrollRef = useRef<HTMLDivElement | null>(null);

  const prefersReducedMotion = usePrefersReducedMotion();
  const analytics = useMovementAnalytics(props.activeBankProduct, props.transactionTaxonomyOverrides);
  const {
    formatCurrency,
    dashboardClusters,
    alertDetails,
    metricExplanations,
    dedupedMovementRows,
    effectiveDashboard,
  } = analytics;

  const selectedMovement =
    dedupedMovementRows.find((movement) => movement.uiKey === selectedMovementKey) ?? null;

  const selectedTemplate = ALL_PRODUCT_TEMPLATES.find((item) => item.label === productTemplate);
  const derivedProductType: BankProduct['productType'] =
    selectedTemplate?.productType ?? props.activeBankProduct?.productType ?? 'credit_card';
  const isCardLikeProduct = isCardLikeType(derivedProductType);
  const txVisualStage =
    props.txWizardStep === 'upload' ? 'evidence' : props.txWizardStep === 'dashboard' ? 'analyst' : 'consent';
  const txVisualScale = txVisualStage === 'consent' ? 1 : txVisualStage === 'evidence' ? 0.9 : 0.82;
  const txVisualY =
    txVisualStage === 'consent'
      ? 0
      : txVisualStage === 'evidence'
        ? -22
        : Math.round(10 + txSummaryScrollDepth * 72);
  const txVisualRotateX =
    txVisualStage === 'consent' ? 14 : txVisualStage === 'evidence' ? 10 : Math.max(-6, 6 - txSummaryScrollDepth * 26);
  const txVisualRotateY =
    txVisualStage === 'consent' ? -10 : txVisualStage === 'evidence' ? -4 : Math.min(4, -2 + txSummaryScrollDepth * 8);
  const txVisualTone =
    derivedProductType === 'credit_card'
      ? 'is-credit'
      : derivedProductType === 'debit_account' || derivedProductType === 'checking_account'
        ? 'is-account'
        : 'is-generic';

  const authorizationState = deriveTransactionAuthorizationState(props.activeBankProduct, {
    bank: quickBank,
    label: productTemplate,
    simulationAccepted: consentAccepted,
  });
  const resolvedBank = authorizationState.bank;
  const resolvedProductLabel = authorizationState.label;
  const consentIsGranted = authorizationState.simulationAccepted;
  const selectedUploadFormat = normalizeUploadFormat(props.activeBankProduct?.assistant?.uploadFormat);
  const activeProductVisualPalette = productVisualPalette(
    `${props.activeBankProduct?.id ?? 'active'}-${resolvedProductLabel || props.activeBankProduct?.label || 'producto'}-${resolvedBank || props.activeBankProduct?.bank || 'bank'}`,
  );
  const activeProductId = props.activeBankProduct?.id ?? null;
  const currentStage = deriveCurrentStage(props.txWizardStep);
  const parsedDocumentCount = props.activeBankProduct?.parsedDocuments.length ?? 0;
  const analysisAlreadyDone = parsedDocumentCount > 0;
  const evidenceResetsUsed = props.activeBankProduct?.evidenceResetsUsed ?? 0;
  const evidenceResetsLeft = Math.max(0, maxEvidenceResets - evidenceResetsUsed);
  const canResetEvidence = analysisAlreadyDone && evidenceResetsLeft > 0 && Boolean(props.resetTransactionProductEvidence);

  const applyOnboarding = useCallback(() => {
    if (!props.activeBankProduct) return;
    props.updateActiveProduct({
      label: resolvedProductLabel,
      bank: resolvedBank,
      productType: derivedProductType,
      simulationAccepted: consentIsGranted,
      randomMode: false,
    });
  }, [
    consentIsGranted,
    derivedProductType,
    props.activeBankProduct,
    props.updateActiveProduct,
    resolvedBank,
    resolvedProductLabel,
  ]);

  const assistant = useTxAssistantChat({
    isOpen: props.isOpen,
    txWizardStep: props.txWizardStep,
    selectedProductId: props.selectedProductId,
    activeBankProduct: props.activeBankProduct,
    activeProductId,
    analysisAlreadyDone,
    maxEvidenceFilesPerProduct: props.maxEvidenceFilesPerProduct,
    effectiveDashboard,
    documentsLoading: props.documentsLoading,
    updateProductById: props.updateProductById,
    updateActiveProduct: props.updateActiveProduct,
    onUploadStatement: props.onUploadStatement,
    onDocumentsParseProgress: props.onDocumentsParseProgress,
    setTxWizardStep: props.setTxWizardStep,
  });

  const {
    invalidateTxSession,
    pendingEvidenceFiles,
    txAssistantInput,
    txAssistantLoading,
    txAssistantError,
    txUploadOnboardingStep,
    assistantMessages,
    evidenceAssistantMessages,
    summaryAssistantMessages,
    starterChips,
    highlightedMovementKeys,
    submitAssistantQuestion,
    summaryText,
    summaryGeneratedAt,
    summaryModel,
    summaryRegenerationsLeft,
    hasSummary,
    setActiveTxAssistantInput,
    setActiveUploadOnboardingStep,
    patchAssistant,
    maybeInitAssistant,
    appendPendingEvidence,
    clearPendingEvidence,
    handleAssistantTextSend,
    refineTransactionSummaryFromFocus,
    generateTransactionSummary,
    processingModeLabel,
    processingMetaLabel,
    processingPrimaryCopy,
    txAssistantNotice,
  } = assistant;

  const resolvedEvidenceFidelity =
    props.activeBankProduct?.dashboard?.evidenceFidelity ??
    (analysisAlreadyDone && props.activeBankProduct
      ? readProductEvidenceFidelity(props.activeBankProduct)
      : null);

  const analystExperienceState = props.activeBankProduct
    ? resolveAnalystExperienceState({
        selectedUploadFormat,
        evidenceFidelity: resolvedEvidenceFidelity,
        parsedDocuments: props.activeBankProduct.parsedDocuments ?? [],
        dashboard: props.activeBankProduct.dashboard ?? null,
        isPipelineBusy: props.documentsLoading || txAssistantLoading,
      })
    : null;

  const analystExperience =
    analystExperienceState?.status === 'resolved' ? analystExperienceState.decision : null;
  const isAnalystExperiencePending =
    props.txWizardStep === 'dashboard' && analystExperienceState?.status === 'pending';
  const isMinimalSummaryChatStep =
    props.txWizardStep === 'dashboard' &&
    !isAnalystExperiencePending &&
    (analystExperience?.mode ?? 'minimal') === 'minimal';
  const analystContinueLabel = isAnalystExperiencePending
    ? 'Preparando análisis…'
    : analystExperience?.mode === 'full'
      ? 'Ver análisis completo'
      : 'Continuar al resumen';
  const analystExperienceReason =
    analystExperienceState?.status === 'pending'
      ? analystExperienceState.reason
      : analystExperience?.reason ?? null;

  const handleAskSuggestedQuestion = useCallback(
    (question: string) => {
      if (props.txWizardStep !== 'dashboard') return;
      const chatAnchor =
        txScrollBodyRef.current?.querySelector<HTMLElement>('.tx-ap-chat-dock, .tx-minimal-chat-card');
      chatAnchor?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      void submitAssistantQuestion(question);
    },
    [props.txWizardStep, submitAssistantQuestion],
  );

  const { closeConfirmKind, dismissCloseConfirm, requestClose, confirmClose } = useTxCloseConfirm({
    isOpen: props.isOpen,
    onClose: props.onClose,
    onInvalidateSession: invalidateTxSession,
    hasPendingDraft: pendingEvidenceFiles.length > 0 || txAssistantInput.trim().length > 0,
    isBusy: props.documentsLoading || txAssistantLoading,
    clearDraft: clearPendingEvidence,
  });

  useTxModalA11y({
    isOpen: props.isOpen,
    modalRef: transactionsModalRef,
    closeConfirmKind,
    dismissCloseConfirm,
    requestClose,
  });
  useTxModalScrollLock({
    isOpen: props.isOpen,
    scrollBodyRef: txScrollBodyRef,
    modalRef: transactionsModalRef,
  });

  const canContinueAuto = authorizationState.canContinue;
  const consentGuidance = canContinueAuto ? null : buildTransactionAuthorizationBlockMessage(authorizationState);
  const hasEvidence = Boolean(props.activeBankProduct?.parsedDocuments.length);
  const activeProductCreations = props.transactionProductCards.length;
  const activeProductSlotsLeft = Math.max(0, props.maxProducts - activeProductCreations);
  const totalProductCreationsLeft = Math.max(0, MAX_TRANSACTION_PRODUCTS_CREATED_TOTAL - props.productsCreatedTotal);
  const isSavedForBatch = Boolean(
    props.activeBankProduct &&
      props.activeBankProduct.connected &&
      props.savedProductIds.includes(props.activeBankProduct.id),
  );
  const canAddMoreProducts = activeProductSlotsLeft > 0 && totalProductCreationsLeft > 0;
  const consentLocked = Boolean(props.activeBankProduct?.connected);

  const productCards = props.transactionProductCards;
  const {
    shuffleTrigger,
    recentlyDockedProductId,
    isDockingToLibrary,
    dockTransitionPhase,
    transitionPulse,
    bumpModalMotion,
    bumpTransitionPulse,
    startAuthorizationTransition,
  } = useTxDockTransition({
    isOpen: props.isOpen,
    txWizardStep: props.txWizardStep,
    activeBankProduct: props.activeBankProduct,
    canContinueAuto,
    resolvedBank,
    resolvedProductLabel,
    derivedProductType,
    consentIsGranted,
    applyOnboarding,
    simulateBankLogin: props.simulateBankLogin,
    maybeInitAssistant,
    setShowTxCarousel,
    productCards,
  });

  const handleCreateProduct = useCallback(
    (seed?: { bank?: string; template?: string; productType?: BankProduct['productType'] }) => {
      if (!canAddMoreProducts) return;
      bumpModalMotion();
      props.addTransactionProduct(
        seed
          ? {
              bank: seed.bank ?? '',
              label: seed.template ?? '',
              productType: seed.productType,
            }
          : undefined,
      );
      setQuickBank(seed?.bank ?? '');
      setProductTemplate(seed?.template ?? '');
      setShowInstitutionCatalog(false);
      setShowTemplateCatalog(false);
      setShowTxCarousel(true);
      props.setTxWizardStep('credentials');
    },
    [bumpModalMotion, canAddMoreProducts, props],
  );

  const openAuthorizationWithPreset = useCallback(
    (preset?: { bank: string; template: string }) => {
      if (preset) {
        const presetTemplate = ALL_PRODUCT_TEMPLATES.find((item) => item.label === preset.template);
        handleCreateProduct({
          bank: `${preset.bank} (simulacion)`,
          template: preset.template,
          productType: presetTemplate?.productType,
        });
        return;
      }
      setShowInstitutionCatalog(true);
      setShowTemplateCatalog(true);
      setShowTxCarousel(true);
      props.setTxWizardStep('credentials');
    },
    [handleCreateProduct, props],
  );

  const libraryProductCards = useMemo(
    () =>
      productCards.filter(
        ({ product }) =>
          product.connected || product.uploadedFiles.length > 0 || product.parsedDocuments.length > 0,
      ),
    [productCards],
  );
  const activeProductIndex = Math.max(
    0,
    libraryProductCards.findIndex((entry) => entry.product.id === props.selectedProductId),
  );

  const selectLibraryProductAt = useCallback(
    (index: number) => {
      if (libraryProductCards.length === 0) return;
      const nextIndex =
        ((index % libraryProductCards.length) + libraryProductCards.length) % libraryProductCards.length;
      const nextProduct = libraryProductCards[nextIndex]?.product;
      if (!nextProduct) return;
      bumpModalMotion();
      setShowTxCarousel(true);
      setProductCarouselIndex(nextIndex);
      props.selectTransactionProduct(nextProduct.id);
    },
    [bumpModalMotion, libraryProductCards, props],
  );

  const txStages = useMemo(
    () =>
      buildTxStages({
        consentLocked,
        hasEvidence,
        setTxWizardStep: props.setTxWizardStep,
      }),
    [consentLocked, hasEvidence, props.setTxWizardStep],
  );
  const activeTxStageIndex = deriveActiveTxStageIndex(props.txWizardStep);

  const goToTxStage = useCallback(
    (stageKey: 'consent' | 'evidence' | 'analyst') => {
      const nextStage = txStages.find((stage) => stage.key === stageKey);
      if (!nextStage || nextStage.disabled) return;
      setShowTxCarousel(true);
      nextStage.go();
    },
    [txStages],
  );

  const libraryPaletteIndices = useMemo(
    () => assignUniquePaletteIndices(libraryProductCards.map(({ product }) => product.id)),
    [libraryProductCards],
  );
  const activeLibraryTheme = useMemo(() => {
    if (libraryProductCards.length === 0) {
      return {
        color: activeProductVisualPalette.base,
        edge: activeProductVisualPalette.tint,
      };
    }
    const paletteIndex = libraryPaletteIndices[productCarouselIndex] ?? productCarouselIndex;
    return {
      color: PRODUCT_STACK_PALETTE[paletteIndex] ?? PRODUCT_STACK_PALETTE[0],
      edge: PRODUCT_STACK_TEXT_PALETTE[paletteIndex] ?? PRODUCT_STACK_TEXT_PALETTE[0],
    };
  }, [
    activeProductVisualPalette.base,
    activeProductVisualPalette.tint,
    libraryPaletteIndices,
    libraryProductCards.length,
    productCarouselIndex,
  ]);

  const filteredInstitutions = useMemo(() => {
    const query = quickBank.trim().toLowerCase().replace(/\s*\(simulacion\)\s*/gi, '').trim();
    const matching = CHILE_FINANCIAL_INSTITUTIONS.filter((institution) =>
      query.length === 0 ? true : institution.toLowerCase().includes(query),
    );
    return (matching.length > 0 ? matching : CHILE_FINANCIAL_INSTITUTIONS).slice(0, 24);
  }, [quickBank]);

  const filteredTemplates = useMemo(() => {
    const query = productTemplate.trim().toLowerCase();
    const matching = ALL_PRODUCT_TEMPLATES.filter((template) =>
      query.length === 0 ? true : template.label.toLowerCase().includes(query),
    );
    return (matching.length > 0 ? matching : ALL_PRODUCT_TEMPLATES).slice(0, 24);
  }, [productTemplate]);

  const buildMovementRefinementTextForModal = useCallback(
    (movement: Parameters<typeof buildMovementRefinementText>[0]) =>
      buildMovementRefinementText(movement, formatCurrency),
    [formatCurrency],
  );

  const saveSelectedMovementOverride = useCallback(() => {
    if (!selectedMovement) return;
    const merchant = overrideMerchantDraft.trim();
    const category = overrideCategoryDraft.trim();
    const matchKey = movementOverrideKey({
      merchant: selectedMovement.merchant || selectedMovement.label,
      label: selectedMovement.label,
    });
    if (!merchant || !category || !matchKey) return;
    props.upsertTransactionTaxonomyOverride({
      id: `${matchKey}:${category}`,
      matchKey,
      matchLabel: selectedMovement.merchant || selectedMovement.label,
      merchant,
      category,
      updatedAt: new Date().toISOString(),
    });
    void refineTransactionSummaryFromFocus(
      'edición manual de categorización',
      `${buildMovementRefinementTextForModal(selectedMovement)}. Ajuste manual solicitado: comercio "${merchant}", categoría "${category}".`,
    );
  }, [
    buildMovementRefinementTextForModal,
    overrideCategoryDraft,
    overrideMerchantDraft,
    props,
    refineTransactionSummaryFromFocus,
    selectedMovement,
  ]);

  const clearSelectedMovementOverride = useCallback(() => {
    if (!selectedMovement?.overrideMatchKey) return;
    props.removeTransactionTaxonomyOverride(selectedMovement.overrideMatchKey);
    void refineTransactionSummaryFromFocus(
      'limpieza de override',
      `${buildMovementRefinementTextForModal(selectedMovement)}. Se eliminó la clasificación manual y debe reevaluarse la categorización base.`,
    );
  }, [
    buildMovementRefinementTextForModal,
    props,
    refineTransactionSummaryFromFocus,
    selectedMovement,
  ]);

  const requestEvidenceReset = useCallback(() => {
    if (!canResetEvidence) return;
    setEvidenceResetConfirmOpen(true);
  }, [canResetEvidence]);

  const dismissEvidenceResetConfirm = useCallback(() => {
    setEvidenceResetConfirmOpen(false);
  }, []);

  const confirmEvidenceReset = useCallback(() => {
    if (!props.resetTransactionProductEvidence) return;
    const reset = props.resetTransactionProductEvidence();
    setEvidenceResetConfirmOpen(false);
    if (reset) {
      invalidateTxSession();
      setSelectedMovementKey(null);
      setShowAllMovements(false);
      setShowTxCarousel(true);
    }
  }, [invalidateTxSession, props]);

  const pauseCarousel = useCallback(() => setCarouselPaused(true), []);
  const resumeCarousel = useCallback(() => setCarouselPaused(false), []);

  useEffect(() => {
    if (!props.isOpen || !props.activeBankProduct || props.activeBankProduct.connected) return;
    if (props.txWizardStep === 'products') {
      props.setTxWizardStep('credentials');
    }
  }, [
    props.isOpen,
    props.activeBankProduct?.connected,
    props.activeBankProduct?.id,
    props.txWizardStep,
    props.setTxWizardStep,
  ]);

  useEffect(() => {
    if (!props.activeBankProduct?.id) return;
    const currentLabel = String(props.activeBankProduct?.label ?? '').trim();
    const looksLikeGenericLabel = /^producto\s+\d+$/i.test(currentLabel);
    setQuickBank(props.activeBankProduct?.bank ?? '');
    setProductTemplate(looksLikeGenericLabel ? '' : currentLabel);
    setSelectedMovementKey(null);
    setShowInstitutionCatalog(true);
    setShowTemplateCatalog(true);
  }, [props.activeBankProduct?.bank, props.activeBankProduct?.id, props.activeBankProduct?.label]);

  useEffect(() => {
    if (!props.isOpen || currentStage !== 'consent' || !showTxCarousel) return;
    setShowInstitutionCatalog(true);
    setShowTemplateCatalog(true);
  }, [props.isOpen, currentStage, showTxCarousel, props.activeBankProduct?.id]);

  useEffect(() => {
    if (libraryProductCards.length === 0) {
      setProductCarouselIndex(0);
      return;
    }
    if (recentlyDockedProductId) {
      const dockedIndex = libraryProductCards.findIndex((entry) => entry.product.id === recentlyDockedProductId);
      if (dockedIndex >= 0) {
        setProductCarouselIndex(dockedIndex);
        return;
      }
    }
    setProductCarouselIndex(activeProductIndex);
  }, [activeProductIndex, libraryProductCards, recentlyDockedProductId]);

  useEffect(() => {
    if (!props.isOpen || props.txWizardStep !== 'upload' || isDockingToLibrary) return;
    maybeInitAssistant();
  }, [
    props.isOpen,
    props.txWizardStep,
    props.activeBankProduct?.id,
    props.activeBankProduct?.connected,
    isDockingToLibrary,
    maybeInitAssistant,
  ]);

  useEffect(() => {
    if (!props.isOpen || activeTxStageIndex !== 2 || prefersReducedMotion || carouselPaused) return;
    const tickCarousel = (container: HTMLDivElement | null) => {
      if (!container) return;
      const firstCard = container.firstElementChild as HTMLElement | null;
      if (!firstCard) return;
      const step = firstCard.offsetWidth + 10;
      const nextLeft = container.scrollLeft + step;
      const maxLeft = Math.max(0, container.scrollWidth - container.clientWidth);
      const shouldLoop = nextLeft >= maxLeft - 4;
      container.scrollTo({
        left: shouldLoop ? 0 : nextLeft,
        behavior: 'smooth',
      });
    };
    const intervalId = window.setInterval(() => {
      tickCarousel(groupCarouselRef.current);
      tickCarousel(insightCarouselRef.current);
    }, 10000);
    return () => window.clearInterval(intervalId);
  }, [
    props.isOpen,
    activeTxStageIndex,
    prefersReducedMotion,
    carouselPaused,
    dashboardClusters.length,
    alertDetails.length,
    metricExplanations.length,
  ]);

  useEffect(() => {
    const el = txSummaryScrollRef.current;
    if (!el || !props.isOpen) return;
    const onScroll = () => {
      const maxScroll = Math.max(1, el.scrollHeight - el.clientHeight);
      setTxSummaryScrollDepth(Math.min(1, Math.max(0, el.scrollTop / maxScroll)));
    };
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [props.isOpen, summaryText, activeTxStageIndex]);

  useEffect(() => {
    if (!props.isOpen) return;
    setConsentAccepted(Boolean(props.activeBankProduct?.simulationAccepted));
  }, [props.isOpen, props.activeBankProduct?.id, props.activeBankProduct?.simulationAccepted]);

  useEffect(() => {
    if (!selectedMovement) return;
    setOverrideMerchantDraft(selectedMovement.merchant || selectedMovement.label);
    setOverrideCategoryDraft(selectedMovement.category || 'Consumo general');
  }, [selectedMovement]);

  useEffect(() => {
    if (!selectedMovementKey) return;
    if (dedupedMovementRows.some((movement) => movement.uiKey === selectedMovementKey)) return;
    setSelectedMovementKey(null);
  }, [selectedMovementKey, dedupedMovementRows]);

  useEffect(() => {
    const thread = txChatThreadRef.current;
    if (!thread || !props.isOpen) return;
    thread.scrollTop = thread.scrollHeight;
  }, [props.isOpen, props.activeBankProduct?.id, props.txWizardStep, evidenceAssistantMessages.length, summaryAssistantMessages.length]);

  useEffect(() => {
    if (!highlightedMovementKeys.length) return;
    const match = dedupedMovementRows.find((row) => highlightedMovementKeys.includes(row.promptKey));
    if (match) setSelectedMovementKey(match.uiKey);
  }, [highlightedMovementKeys, dedupedMovementRows]);

  useEffect(() => {
    if (!props.isOpen) setEvidenceResetConfirmOpen(false);
  }, [props.isOpen]);

  return {
    onContinueWithoutProducts,
    transactionsModalRef,
    txScrollBodyRef,
    txChatThreadRef,
    groupCarouselRef,
    insightCarouselRef,
    txSummaryScrollRef,
    prefersReducedMotion,
    analytics,
    selectedMovement,
    showAllMovements,
    setShowAllMovements,
    execTab,
    setExecTab,
    quickBank,
    setQuickBank,
    productTemplate,
    setProductTemplate,
    showInstitutionCatalog,
    setShowInstitutionCatalog,
    showTemplateCatalog,
    setShowTemplateCatalog,
    showTxCarousel,
    setShowTxCarousel,
    resolvedBank,
    resolvedProductLabel,
    isCardLikeProduct,
    txVisualStage,
    txVisualScale,
    txVisualY,
    txVisualRotateX,
    txVisualRotateY,
    txVisualTone,
    activeProductVisualPalette,
    currentStage,
    analysisAlreadyDone,
    isMinimalSummaryChatStep,
    isAnalystExperiencePending,
    analystContinueLabel,
    analystContinueDisabled: isAnalystExperiencePending,
    analystExperienceReason,
    txAssistantNotice,
    canContinueAuto,
    consentGuidance,
    consentLocked,
    consentAccepted,
    setConsentAccepted,
    activeProductCreations,
    canAddMoreProducts,
    isSavedForBatch,
    libraryProductCards,
    productCarouselIndex,
    shuffleTrigger,
    recentlyDockedProductId,
    isDockingToLibrary,
    dockTransitionPhase,
    transitionPulse,
    activeLibraryTheme,
    txStages,
    activeTxStageIndex,
    filteredInstitutions,
    filteredTemplates,
    closeConfirmKind,
    dismissCloseConfirm,
    requestClose,
    confirmClose,
    evidenceResetConfirmOpen,
    evidenceResetsLeft,
    requestEvidenceReset,
    dismissEvidenceResetConfirm,
    confirmEvidenceReset,
    pauseCarousel,
    resumeCarousel,
    handleCreateProduct,
    openAuthorizationWithPreset,
    selectLibraryProductAt,
    goToTxStage,
    bumpTransitionPulse,
    startAuthorizationTransition,
    handleAskSuggestedQuestion,
    buildMovementRefinementTextForModal,
    saveSelectedMovementOverride,
    clearSelectedMovementOverride,
    assistant,
    RECOMMENDED_TX_PRODUCTS,
    selectedUploadFormat,
    selectedMovementKey,
    setSelectedMovementKey,
    overrideMerchantDraft,
    setOverrideMerchantDraft,
    overrideCategoryDraft,
    setOverrideCategoryDraft,
  };
}
