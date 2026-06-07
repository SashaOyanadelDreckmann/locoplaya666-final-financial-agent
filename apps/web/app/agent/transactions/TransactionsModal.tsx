'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CHILE_FINANCIAL_INSTITUTIONS } from '@/lib/financialCatalog';
import { deriveTransactionAuthorizationState } from '@/lib/transactions-authorization.helpers';

import {
  ALL_PRODUCT_TEMPLATES,
  PRODUCT_STACK_PALETTE,
  PRODUCT_STACK_TEXT_PALETTE,
  TX_CATEGORY_OPTIONS,
} from './constants';
import ModalNumbersCanvas from '@/components/agent/ModalNumbersCanvas';
import { MAX_TRANSACTION_PRODUCTS_CREATED_TOTAL } from '../agent-page.constants';
import { useMovementAnalytics } from './use-movement-analytics';
import { TxEvidenceStep } from './TxEvidenceStep';
import { TxAnalystDashboard } from './TxAnalystDashboard';
import { usePrefersReducedMotion } from './use-prefers-reduced-motion';
import { useTxAssistantChat } from './use-tx-assistant-chat';
import { useTxCloseConfirm } from './use-tx-close-confirm';
import { useTxDockTransition } from './use-tx-dock-transition';
import { useTxModalA11y } from './use-tx-modal-a11y';
import { useTxModalScrollLock } from './use-tx-modal-scroll';
import {
  buildTxStageCta,
  buildTxStages,
  buildTxStageSummary,
  deriveActiveTxStageIndex,
  deriveCurrentStage,
} from './tx-wizard.helpers';
import {
  NumericDust,
  confidenceBandLong,
  formatPercentCompact,
} from './presentation';
import { TxConsentStep } from './TxConsentStep';
import { movementOverrideKey } from './taxonomy';
import type {
  BankProduct,
  TransactionsModalProps,
} from './types';
import { libraryCardSurface, productVisualPalette } from './visuals';

export function TransactionsModal(props: TransactionsModalProps) {
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [selectedMovementKey, setSelectedMovementKey] = useState<string | null>(null);
  const [overrideMerchantDraft, setOverrideMerchantDraft] = useState('');
  const [overrideCategoryDraft, setOverrideCategoryDraft] = useState<string>(TX_CATEGORY_OPTIONS[0]);
  const transactionsModalRef = useRef<HTMLDivElement | null>(null);
  const txScrollBodyRef = useRef<HTMLDivElement | null>(null);
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
  const [showAllMovements, setShowAllMovements] = useState(false);
  const [execTab, setExecTab] = useState<'summary' | 'metrics'>('summary');

  const [quickBank, setQuickBank] = useState('');
  const [productTemplate, setProductTemplate] = useState('');
  const [showInstitutionCatalog, setShowInstitutionCatalog] = useState(false);
  const [showTemplateCatalog, setShowTemplateCatalog] = useState(false);
  const [showTxCarousel, setShowTxCarousel] = useState(false);
  const [txSummaryScrollDepth, setTxSummaryScrollDepth] = useState(0);
  const prefersReducedMotion = usePrefersReducedMotion();
  const txChatThreadRef = useRef<HTMLDivElement | null>(null);
  const groupCarouselRef = useRef<HTMLDivElement | null>(null);
  const insightCarouselRef = useRef<HTMLDivElement | null>(null);
  const txSummaryScrollRef = useRef<HTMLDivElement | null>(null);
  const selectedTemplate = ALL_PRODUCT_TEMPLATES.find((item) => item.label === productTemplate);
  const derivedProductType: BankProduct['productType'] =
    selectedTemplate?.productType ??
    props.activeBankProduct?.productType ??
    'credit_card';

  const txCardLikeTypes: Array<BankProduct['productType']> = [
    'credit_card',
    'debit_account',
    'checking_account',
    'savings_account',
  ];
  const isCardLikeProduct = txCardLikeTypes.includes(derivedProductType);
  const txVisualStage =
    props.txWizardStep === 'upload' ? 'evidence' : props.txWizardStep === 'dashboard' ? 'analyst' : 'consent';
  const txVisualScale =
    txVisualStage === 'consent' ? 1 : txVisualStage === 'evidence' ? 0.9 : 0.82;
  const txVisualY =
    txVisualStage === 'consent'
      ? 0
      : txVisualStage === 'evidence'
        ? -22
        : Math.round(10 + txSummaryScrollDepth * 72);
  const txVisualRotateX =
    txVisualStage === 'consent'
      ? 14
      : txVisualStage === 'evidence'
        ? 10
        : Math.max(-6, 6 - txSummaryScrollDepth * 26);
  const txVisualRotateY =
    txVisualStage === 'consent'
      ? -10
      : txVisualStage === 'evidence'
        ? -4
        : Math.min(4, -2 + txSummaryScrollDepth * 8);
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
  const activeProductVisualPalette = productVisualPalette(
    `${props.activeBankProduct?.id ?? 'active'}-${resolvedProductLabel || props.activeBankProduct?.label || 'producto'}-${resolvedBank || props.activeBankProduct?.bank || 'bank'}`
  );
  const activeProductId = props.activeBankProduct?.id ?? null;
  const currentStage = deriveCurrentStage(props.txWizardStep);
  const parsedDocumentCount = props.activeBankProduct?.parsedDocuments.length ?? 0;
  const analysisAlreadyDone = parsedDocumentCount > 0;

  const applyOnboarding = () => {
    if (!props.activeBankProduct) return;
    props.updateActiveProduct({
      label: resolvedProductLabel,
      bank: resolvedBank,
      productType: derivedProductType,
      simulationAccepted: consentIsGranted,
      randomMode: false,
    });
  };

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
    summaryText,
    summaryGeneratedAt,
    summaryModel,
    summaryRegenerationsLeft,
    selectedUploadFormat,
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
  } = assistant;

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
  const hasEvidence = Boolean(props.activeBankProduct?.parsedDocuments.length);
  const activeProductCreations = props.transactionProductCards.length;
  const activeProductSlotsLeft = Math.max(0, props.maxProducts - activeProductCreations);
  const totalProductCreationsLeft = Math.max(0, MAX_TRANSACTION_PRODUCTS_CREATED_TOTAL - props.productsCreatedTotal);
  const isSavedForBatch = Boolean(
    props.activeBankProduct &&
    props.activeBankProduct.connected &&
    props.savedProductIds.includes(props.activeBankProduct.id)
  );
  const canAddMoreProducts = activeProductSlotsLeft > 0 && totalProductCreationsLeft > 0;
  const consentLocked = Boolean(props.activeBankProduct?.connected);
  const recommendedTxProducts: Array<{ title: string; bank: string; template: string }> = [
    { title: 'Tarjeta de crédito', bank: 'Banco BICE', template: 'Tarjeta de crédito' },
    { title: 'Cuenta corriente', bank: 'Banco de Chile', template: 'Cuenta corriente' },
    { title: 'Cuenta vista', bank: 'BancoEstado', template: 'Cuenta vista' },
  ];

  function handleCreateProduct(seed?: { bank?: string; template?: string; productType?: BankProduct['productType'] }) {
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
  }

  function openAuthorizationWithPreset(preset?: { bank: string; template: string }) {
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
  }

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
  }, [props.activeBankProduct?.id]);
  useEffect(() => {
    if (!props.isOpen || currentStage !== 'consent' || !showTxCarousel) return;
    setShowInstitutionCatalog(true);
    setShowTemplateCatalog(true);
  }, [props.isOpen, currentStage, showTxCarousel, props.activeBankProduct?.id]);
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

  const [productCarouselIndex, setProductCarouselIndex] = useState(0);
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

  const libraryProductCards = productCards.filter(
    ({ product }) =>
      product.connected ||
      product.uploadedFiles.length > 0 ||
      product.parsedDocuments.length > 0 ||
      product.id === props.selectedProductId,
  );
  const activeProductIndex = Math.max(
    0,
    libraryProductCards.findIndex((entry) => entry.product.id === props.selectedProductId),
  );
  const orderedProductCards =
    libraryProductCards.length === 0
      ? []
      : Array.from(
          { length: libraryProductCards.length },
          (_, offset) => libraryProductCards[(productCarouselIndex + offset) % libraryProductCards.length]
        );
  const selectLibraryProductAt = (index: number) => {
    if (libraryProductCards.length === 0) return;
    const nextIndex = ((index % libraryProductCards.length) + libraryProductCards.length) % libraryProductCards.length;
    const nextProduct = libraryProductCards[nextIndex]?.product;
    if (!nextProduct) return;
    bumpModalMotion();
    setShowTxCarousel(true);
    setProductCarouselIndex(nextIndex);
    props.selectTransactionProduct(nextProduct.id);
  };
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

  const goToTxStage = (stageKey: 'consent' | 'evidence' | 'analyst') => {
    const nextStage = txStages.find((stage) => stage.key === stageKey);
    if (!nextStage || nextStage.disabled) return;
    setShowTxCarousel(true);
    nextStage.go();
  };
  useEffect(() => {
    if (libraryProductCards.length === 0) {
      setProductCarouselIndex(0);
      return;
    }
    setProductCarouselIndex(activeProductIndex);
  }, [activeProductIndex, libraryProductCards.length]);
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
    if (!props.isOpen || activeTxStageIndex !== 2 || prefersReducedMotion) return;
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
  }, [props.isOpen, props.activeBankProduct?.id, assistantMessages.length]);

  const txStageSummary = useMemo(
    () =>
      buildTxStageSummary({
        currentStage,
        activeProductCreations,
        maxProducts: props.maxProducts,
        productsCreatedTotal: props.productsCreatedTotal,
      }),
    [activeProductCreations, currentStage, props.maxProducts, props.productsCreatedTotal],
  );
  const txStageCta = useMemo(
    () =>
      buildTxStageCta({
        currentStage,
        analysisAlreadyDone,
        canContinueAuto,
        authorizationState,
      }),
    [analysisAlreadyDone, authorizationState, canContinueAuto, currentStage],
  );

  const buildMovementRefinementText = (movement: {
    label: string;
    merchant?: string;
    category?: string;
    amount: number;
    date?: string;
    categoryConfidence?: number;
  }) =>
    [
      `Movimiento: ${movement.label}`,
      movement.merchant ? `Comercio detectado: ${movement.merchant}` : null,
      movement.category ? `Categoría actual: ${movement.category}` : null,
      movement.date ? `Fecha: ${movement.date}` : null,
      `Monto: ${formatCurrency(movement.amount)}`,
      movement.categoryConfidence !== undefined
        ? `Confianza categorización: ${formatPercentCompact(movement.categoryConfidence * 100)} (${confidenceBandLong(movement.categoryConfidence)})`
        : null,
    ]
      .filter(Boolean)
      .join('. ');

  function saveSelectedMovementOverride() {
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
      `${buildMovementRefinementText(selectedMovement)}. Ajuste manual solicitado: comercio "${merchant}", categoría "${category}".`,
    );
  }

  function clearSelectedMovementOverride() {
    if (!selectedMovement?.overrideMatchKey) return;
    props.removeTransactionTaxonomyOverride(selectedMovement.overrideMatchKey);
    void refineTransactionSummaryFromFocus(
      'limpieza de override',
      `${buildMovementRefinementText(selectedMovement)}. Se eliminó la clasificación manual y debe reevaluarse la categorización base.`,
    );
  }

  if (!props.isOpen) return null;

  const modalTree = (
    <div className="agent-modal-overlay transactions-modal-overlay" onClick={requestClose}>
      <div
        className="agent-modal transactions-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="transactions-modal-title"
        aria-describedby="transactions-modal-intro"
        tabIndex={-1}
        ref={transactionsModalRef}
        onClick={(e) => e.stopPropagation()}
        data-ui-version="v2"
        data-dock-phase={dockTransitionPhase}
        data-stage={currentStage}
        data-reduced-motion={prefersReducedMotion ? 'true' : 'false'}
      >
        {!prefersReducedMotion ? (
          <ModalNumbersCanvas
            shuffleTrigger={shuffleTrigger}
            transitionPhase={dockTransitionPhase}
            pulse={transitionPulse}
          />
        ) : null}
        {!prefersReducedMotion ? (
          <div className="tx-transition-flood-layer" aria-hidden="true">
            <NumericDust scope="flood" pulse={transitionPulse} active={dockTransitionPhase !== 'idle'} count={42} />
          </div>
        ) : null}
        <div className="bcc-modal-header tx-modal-header-layer">
          <div className="bcc-modal-title-wrap">
            <span className="bcc-modal-eyebrow">Financieramente</span>
            <h3 id="transactions-modal-title" className="bcc-modal-title">Productos y transacciones</h3>
          </div>
          <button
            type="button"
            className="agent-modal-close tx-close-minimal"
            onClick={requestClose}
            aria-label="Cerrar panel de productos y transacciones"
          >
            ×
          </button>
        </div>
        <div className="tx-scroll-body" ref={txScrollBodyRef}>
        <p id="transactions-modal-intro" className="agent-modal-intro tx-modal-header-layer">
          Conecta cada producto, sube cartolas y revisa el resumen analítico. El contexto validado se sincroniza solo.
        </p>
        <section className="pt-shell tx-stage-shell tx-modal-header-layer">
          <aside className="pt-left tx-panel-surface tx-panel-surface--library">
            <NumericDust scope="library" pulse={transitionPulse} active={!prefersReducedMotion && dockTransitionPhase !== 'idle'} />
            <div className="pt-list-head">
              <h4>Biblioteca de productos</h4>
            <div className="pt-list-head-actions">
              <button
                type="button"
                className="continue-ghost tx-create-product-btn"
                onClick={() => handleCreateProduct()}
                disabled={!canAddMoreProducts}
              >
                + Agregar producto
              </button>
              </div>
            </div>
            <div className="tx-meta-stack" aria-label="Estado y límites del módulo">
              {props.creationNotice ? (
                <div className="tx-meta-card is-warning" role="status">
                  <span className="tx-meta-card-kicker">Estado de creación</span>
                  <p>{props.creationNotice}</p>
                </div>
              ) : null}
              <div className="tx-meta-card is-neutral">
                <span className="tx-meta-card-kicker">Límites operativos</span>
                <p>{activeProductCreations}/{props.maxProducts} activos · {props.productsCreatedTotal}/{MAX_TRANSACTION_PRODUCTS_CREATED_TOTAL} creados · quedan {totalProductCreationsLeft} totales</p>
              </div>
              <div className="tx-batch-recommendation-banner" role="status" aria-live="polite">
                <div className="tx-batch-recommendation-copy">
                  <span className="tx-batch-recommendation-kicker">Sincronización automática</span>
                  <p>
                    Cuando guardes productos con movimientos, el contexto validado se actualiza solo para el agente principal.
                  </p>
                </div>
              </div>
            </div>
            <div className="pt-list">
              {libraryProductCards.length > 0 ? (
                <div className="tx-library-stack-block">
                  <div className="pt-stack-carousel tx-library-is-saved">
                    {orderedProductCards.slice(0, 4).map(({ product, descriptor, intel }, stackIndex) => {
                      const isTop = stackIndex === 0;
                      const paletteIndex = (productCarouselIndex + stackIndex) % PRODUCT_STACK_PALETTE.length;
                      const color = PRODUCT_STACK_PALETTE[paletteIndex];
                      const textAccent = PRODUCT_STACK_TEXT_PALETTE[(paletteIndex + 1) % PRODUCT_STACK_TEXT_PALETTE.length];
                      const visualPalette = productVisualPalette(`${product.id}-${product.label}-${product.bank}`);
                      const cardSurface = libraryCardSurface(visualPalette);
                      return (
                        <div
                          key={product.id}
                          className={`pt-item pt-item-stack tx-lib-card tx-lib-card-shell ${isTop ? 'is-active is-top' : ''} ${recentlyDockedProductId === product.id ? 'tx-lib-enter' : ''}`}
                          data-docked={recentlyDockedProductId === product.id ? 'true' : 'false'}
                          style={{
                            ['--tx-lib-inline-bg' as any]: cardSurface.background,
                            ['--tx-lib-inline-edge' as any]: cardSurface.borderColor,
                            ['--tx-lib-inline-shadow' as any]: cardSurface.boxShadow,
                            ['--pt-card-active-bg' as any]: color,
                            ['--pt-card-active-border' as any]: color,
                            ['--pt-card-active-shadow' as any]: color,
                            ['--pt-stack-color' as any]: color,
                            ['--pt-stack-bg' as any]: color,
                            ['--pt-stack-border' as any]: color,
                            ['--pt-stack-accent' as any]: textAccent,
                            ['--pt-stack-idx' as any]: stackIndex,
                            ['--tx-lib-base' as any]: visualPalette.base,
                            ['--tx-lib-glow' as any]: visualPalette.glow,
                            ['--tx-lib-edge' as any]: visualPalette.edge,
                            ['--tx-lib-tint' as any]: visualPalette.tint,
                          }}
                        >
                          <button
                            type="button"
                            className="tx-lib-card-select"
                            onClick={() => {
                              selectLibraryProductAt(productCarouselIndex + stackIndex);
                            }}
                            aria-current={isTop ? 'true' : undefined}
                            aria-label={`Seleccionar ${product.label}`}
                          >
                            {recentlyDockedProductId === product.id && !prefersReducedMotion ? (
                              <NumericDust scope="library-card" pulse={transitionPulse} active count={18} />
                            ) : null}
                            <div className="tx-lib-card-sheen" aria-hidden="true" />
                            <div className="pt-item-top tx-lib-card-top">
                              <div className="tx-lib-card-copy">
                                <span className="tx-lib-card-eyebrow">
                                  {product.productType === 'credit_card' ? 'Tarjeta autorizada' : 'Producto conectado'}
                                </span>
                                <span className="pt-item-name">{product.label}</span>
                              </div>
                              <span className="pt-item-status">{product.connected ? 'Autorizado' : 'Pendiente'}</span>
                            </div>
                            <span className="pt-item-bank">{product.bank || 'Institución por definir'}</span>
                            <div className="pt-item-meta">
                              <span>{intel.docs} respaldo(s)</span>
                              <span>{intel.amounts.length} movimiento(s)</span>
                            </div>
                            <div className="tx-lib-card-chip" aria-hidden="true" />
                          </button>
                          {isTop ? (
                            <button
                              type="button"
                              className="pt-item-delete-mini"
                              aria-label={`Eliminar ${product.label}`}
                              onClick={() => {
                                props.deleteTransactionProduct(product.id);
                              }}
                            >
                              ×
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                  {libraryProductCards.length > 1 ? (
                    <div className="pt-stack-nav">
                      <button
                        type="button"
                        className="continue-ghost"
                        aria-label="Producto anterior"
                        onClick={() => selectLibraryProductAt(productCarouselIndex - 1)}
                      >
                        ←
                      </button>
                      <span className="tx-lib-card-nav-status" aria-live="polite">
                        {productCarouselIndex + 1} / {libraryProductCards.length}
                      </span>
                      <button
                        type="button"
                        className="continue-ghost"
                        aria-label="Producto siguiente"
                        onClick={() => selectLibraryProductAt(productCarouselIndex + 1)}
                      >
                        →
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="tx-library-empty">
                  <span className="tx-library-empty-kicker">Biblioteca vacía</span>
                  <p>Tus productos aparecen aquí al autorizarlos o cuando tengan evidencias en curso.</p>
                </div>
              )}
            </div>
          </aside>

          <div className={`pt-right tx-panel-surface tx-panel-surface--workspace ${!props.activeBankProduct || showTxCarousel ? '' : 'tx-only-cta'}`}>
            <NumericDust
              scope="workspace"
              pulse={transitionPulse}
              active={!prefersReducedMotion && (dockTransitionPhase !== 'idle' || currentStage !== 'consent')}
            />
            <div className="tx-meta-card is-neutral tx-flow-status-card" role="status" aria-live="polite">
              <span className="tx-meta-card-kicker">Estado del flujo</span>
              <p>{txStageSummary}</p>
              <p>{txStageCta}</p>
            </div>
            {props.activeBankProduct && showTxCarousel && activeTxStageIndex >= 0 ? (
              <nav className="tx-wizard-stepper" aria-label="Pasos del flujo de transacciones">
                <ol className="tx-wizard-stepper-list">
                  {txStages.map((stage, index) => {
                    const isCurrent = activeTxStageIndex === index;
                    return (
                      <li key={stage.key} className="tx-wizard-stepper-item">
                        <button
                          type="button"
                          className={`tx-wizard-step ${isCurrent ? 'is-current' : ''} ${stage.disabled ? 'is-disabled' : ''}`}
                          onClick={() => goToTxStage(stage.key)}
                          disabled={stage.disabled}
                          aria-current={isCurrent ? 'step' : undefined}
                          title={stage.disabled ? stage.disabledReason : stage.copy}
                        >
                          <span className="tx-wizard-step-title">{stage.title}</span>
                          <span className="tx-wizard-step-idx" aria-hidden="true">
                            {index + 1}
                          </span>
                          <span className="tx-wizard-step-copy">{stage.copy}</span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </nav>
            ) : null}
            {!props.activeBankProduct ? (
              <div className="transactions-summary-card pt-empty-state">
                <div className="pt-empty-head">
                  <span className="transactions-summary-title">Comienza aquí</span>
                  <h4>Activa tu primera ficha financiera</h4>
                  <p>Crea un producto para iniciar un flujo simple y validable.</p>
                </div>
                <div className="pt-empty-grid" role="list" aria-label="Capacidades del panel">
                  <article className="pt-empty-item" role="listitem">
                    <span>1</span>
                    <div>
                      <strong>Configura producto</strong>
                      <p>Define banco, tipo y alias para organizar tu biblioteca.</p>
                    </div>
                  </article>
                  <article className="pt-empty-item" role="listitem">
                    <span>2</span>
                    <div>
                      <strong>Sube evidencias</strong>
                      <p>Adjunta cartolas o respaldos y el sistema extrae datos clave.</p>
                    </div>
                  </article>
                  <article className="pt-empty-item" role="listitem">
                    <span>3</span>
                    <div>
                      <strong>Obtén insights</strong>
                      <p>Recibe indicadores y hallazgos listos para el agente core.</p>
                    </div>
                  </article>
                </div>
                <div className="agent-modal-actions pt-empty-actions">
                  <button
                    type="button"
                    className="continue-ghost tx-create-product-btn"
                    onClick={() => handleCreateProduct()}
                    disabled={!canAddMoreProducts}
                  >
                    Crear primer producto
                  </button>
                </div>
              </div>
            ) : (
              <>
                {!showTxCarousel ? (
                  <div className="tx-carousel-gate tx-preset-gate">
                    <div className="tx-preset-shell">
                      <p className="tx-preset-title">Agregar movimiento de:</p>
                      <div className="tx-preset-grid">
                        {recommendedTxProducts.map((preset) => (
                          <button
                            key={preset.title}
                            type="button"
                            className="tx-preset-btn"
                            onClick={() => openAuthorizationWithPreset(preset)}
                            disabled={!canAddMoreProducts}
                          >
                            {preset.title}
                          </button>
                        ))}
                        <button
                          type="button"
                          className="tx-preset-btn tx-preset-btn-add"
                          onClick={() => handleCreateProduct()}
                          disabled={!canAddMoreProducts}
                        >
                          + Agregar otro producto
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                <div className="tx-content-carousel">
                  {!prefersReducedMotion &&
                  (activeTxStageIndex === 0 || (activeTxStageIndex === 1 && isDockingToLibrary)) && (
                  <div className="tx-3d-hero-shell" aria-hidden="true">
                    <div className="relative w-full flex items-center justify-center p-0">
                      <div className="relative w-full py-0">
                      <div className={`tx-3d-sway-wrap${txVisualStage === 'consent' && !isDockingToLibrary ? ' is-floating' : ''}`}>
                      <div
                        className={`tx-3d-hero ${txVisualTone} ${isCardLikeProduct ? 'is-card-like' : 'is-generic-like'} ${activeTxStageIndex % 2 === 1 ? 'is-solid-step' : 'is-anim-step'} ${isDockingToLibrary ? 'is-docking-out' : ''}`}
                        style={{
                          ['--tx-hero-base' as any]: activeProductVisualPalette.base,
                          ['--tx-hero-glow' as any]: activeProductVisualPalette.glow,
                          ['--tx-hero-edge' as any]: activeProductVisualPalette.edge,
                          ['--tx-hero-tint' as any]: activeProductVisualPalette.tint,
                          transform: `translate3d(0, ${txVisualY}px, 0) rotateX(${txVisualRotateX}deg) rotateY(${txVisualRotateY}deg) scale(${txVisualScale})`,
                        }}
                      >
                        <NumericDust scope="hero" pulse={transitionPulse} active={!prefersReducedMotion && dockTransitionPhase !== 'idle'} />
                        <div className="tx-3d-hero-sheen" />
                        <div className="tx-3d-hero-core">
                          <span className="tx-3d-hero-eyebrow">
                            {isCardLikeProduct ? 'Producto financiero' : 'Instrumento financiero'}
                          </span>
                          <strong>{resolvedProductLabel || props.activeBankProduct.label || 'Producto activo'}</strong>
                          <span>{resolvedBank || props.activeBankProduct.bank || 'Institución por definir'}</span>
                        </div>
                        <div className="tx-3d-hero-chip" />
                      </div>
                      </div>
                      </div>
                    </div>
                  </div>
                  )}
                  {activeTxStageIndex === 1 && !isDockingToLibrary && !prefersReducedMotion && (
                    <div className="tx-hero-shell-spacer" aria-hidden="true" />
                  )}
                  {activeTxStageIndex === 0 && props.activeBankProduct && (
                    <TxConsentStep
                      quickBank={quickBank}
                      productTemplate={productTemplate}
                      showInstitutionCatalog={showInstitutionCatalog}
                      showTemplateCatalog={showTemplateCatalog}
                      filteredInstitutions={filteredInstitutions}
                      filteredTemplates={filteredTemplates}
                      consentAccepted={consentAccepted}
                      canContinueAuto={canContinueAuto}
                      isDockingToLibrary={isDockingToLibrary}
                      transactionUploadError={props.transactionUploadError}
                      onBankChange={(value) => {
                        setQuickBank(value);
                        setShowInstitutionCatalog(true);
                      }}
                      onTemplateChange={(value) => {
                        setProductTemplate(value);
                        setShowTemplateCatalog(true);
                      }}
                      onOpenInstitutionCatalog={() => setShowInstitutionCatalog(true)}
                      onOpenTemplateCatalog={() => setShowTemplateCatalog(true)}
                      onToggleInstitutionCatalog={() => setShowInstitutionCatalog((prev) => !prev)}
                      onToggleTemplateCatalog={() => setShowTemplateCatalog((prev) => !prev)}
                      onSelectInstitution={(institution) => {
                        setQuickBank(`${institution} (simulacion)`);
                        setShowInstitutionCatalog(false);
                      }}
                      onSelectTemplate={(template) => {
                        setProductTemplate(template);
                        setShowTemplateCatalog(false);
                      }}
                      onToggleConsent={() => {
                        const nextAccepted = !consentAccepted;
                        setConsentAccepted(nextAccepted);
                        props.updateActiveProduct({
                          simulationAccepted: nextAccepted,
                          connected: false,
                        });
                      }}
                      onDeleteProduct={() => props.deleteTransactionProduct(props.activeBankProduct!.id)}
                      onContinue={startAuthorizationTransition}
                    />
                  )}

                  {activeTxStageIndex === 1 && props.activeBankProduct && (
                    <TxEvidenceStep
                      key={`tx-evidence-${props.selectedProductId}`}
                      activeBankProduct={props.activeBankProduct}
                      maxEvidenceFilesPerProduct={props.maxEvidenceFilesPerProduct}
                      summaryRegenerationsLeft={summaryRegenerationsLeft}
                      transitionPulse={transitionPulse}
                      dockTransitionPhase={dockTransitionPhase}
                      currentStage={currentStage}
                      scrollRef={txSummaryScrollRef}
                      assistantMessages={assistantMessages}
                      analysisAlreadyDone={analysisAlreadyDone}
                      txUploadOnboardingStep={txUploadOnboardingStep}
                      selectedUploadFormat={selectedUploadFormat}
                      pendingEvidenceFiles={pendingEvidenceFiles}
                      txAssistantInput={txAssistantInput}
                      txAssistantLoading={txAssistantLoading}
                      documentsLoading={props.documentsLoading}
                      transactionUploadError={props.transactionUploadError}
                      summaryText={summaryText}
                      summaryGeneratedAt={summaryGeneratedAt}
                      summaryModel={summaryModel}
                      processingModeLabel={processingModeLabel}
                      processingMetaLabel={processingMetaLabel}
                      processingPrimaryCopy={processingPrimaryCopy}
                      documentsParseProgress={props.documentsParseProgress}
                      txAssistantError={txAssistantError}
                      chatThreadRef={txChatThreadRef}
                      onPatchUploadFormat={(format) => patchAssistant({ uploadFormat: format })}
                      onResetUploadFormat={() => patchAssistant({ uploadFormat: null })}
                      onSetUploadOnboardingStep={setActiveUploadOnboardingStep}
                      onBumpTransitionPulse={bumpTransitionPulse}
                      onAppendPendingEvidence={appendPendingEvidence}
                      onAssistantInputChange={setActiveTxAssistantInput}
                      onAssistantSend={() => void handleAssistantTextSend()}
                      onRefineSummary={(source: string, body: string) => void refineTransactionSummaryFromFocus(source, body)}
                      onGoToAnalyst={() => goToTxStage('analyst')}
                      onRegenerateSummary={() =>
                        void generateTransactionSummary({
                          feedback: 'Revisar nuevamente consistencia de movimientos y resumen.',
                          isRegeneration: true,
                        })
                      }
                    />
                  )}

                  {activeTxStageIndex === 2 && props.activeBankProduct && (
                    <TxAnalystDashboard
                      analytics={analytics}
                      activeBankProduct={props.activeBankProduct}
                      summaryText={summaryText}
                      summaryGeneratedAt={summaryGeneratedAt}
                      summaryModel={summaryModel}
                      hasSummary={hasSummary}
                      summaryRegenerationsLeft={summaryRegenerationsLeft}
                      showAllMovements={showAllMovements}
                      onToggleShowAllMovements={() => setShowAllMovements((prev) => !prev)}
                      execTab={execTab}
                      onExecTabChange={setExecTab}
                      selectedMovement={selectedMovement}
                      selectedMovementKey={selectedMovementKey}
                      onSelectMovementKey={setSelectedMovementKey}
                      overrideMerchantDraft={overrideMerchantDraft}
                      onOverrideMerchantDraftChange={setOverrideMerchantDraft}
                      overrideCategoryDraft={overrideCategoryDraft}
                      onOverrideCategoryDraftChange={setOverrideCategoryDraft}
                      groupCarouselRef={groupCarouselRef}
                      insightCarouselRef={insightCarouselRef}
                      assistantMessages={assistantMessages}
                      txAssistantInput={txAssistantInput}
                      onAssistantInputChange={setActiveTxAssistantInput}
                      txAssistantLoading={txAssistantLoading}
                      documentsLoading={props.documentsLoading}
                      isSavedForBatch={isSavedForBatch}
                      onDeleteProduct={() => props.deleteTransactionProduct(props.activeBankProduct!.id)}
                      onGoToEvidence={() => goToTxStage('evidence')}
                      onSaveProductForBatch={() => {
                        const saved = props.saveTransactionProductForBatch();
                        if (saved) {
                          props.setTxWizardStep('products');
                          setShowTxCarousel(false);
                        }
                      }}
                      onRefineSummary={(source: string, body: string) => void refineTransactionSummaryFromFocus(source, body)}
                      onRegenerateSummary={() =>
                        void generateTransactionSummary({
                          feedback: 'Revisar nuevamente consistencia de movimientos y resumen.',
                          isRegeneration: true,
                        })
                      }
                      onAssistantSend={() => void handleAssistantTextSend()}
                      onSaveMovementOverride={saveSelectedMovementOverride}
                      onClearMovementOverride={clearSelectedMovementOverride}
                      buildMovementRefinementText={buildMovementRefinementText}
                    />
                  )}
                </div>

                  </>
                )}
              </>
            )}
          </div>
        </section>
        </div>{/* /tx-scroll-body */}
        {closeConfirmKind ? (
          <div className="tx-close-confirm-layer" role="presentation">
            <div
              className="tx-close-confirm-dialog"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="tx-close-confirm-title"
              aria-describedby="tx-close-confirm-body"
            >
              <h4 id="tx-close-confirm-title" className="tx-close-confirm-title">
                {closeConfirmKind === 'busy' ? 'Análisis en curso' : 'Borrador sin enviar'}
              </h4>
              <p id="tx-close-confirm-body" className="tx-close-confirm-body">
                {closeConfirmKind === 'busy'
                  ? 'Hay un análisis en curso. Si cierras ahora, el proceso puede quedar incompleto.'
                  : 'Tienes archivos o notas sin enviar. Si cierras, se descartará ese borrador.'}
              </p>
              <div className="tx-close-confirm-actions">
                <button type="button" className="continue-ghost" onClick={dismissCloseConfirm}>
                  Seguir en el panel
                </button>
                <button type="button" className="button-primary" onClick={confirmClose}>
                  Cerrar igual
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalTree, document.body);
}
