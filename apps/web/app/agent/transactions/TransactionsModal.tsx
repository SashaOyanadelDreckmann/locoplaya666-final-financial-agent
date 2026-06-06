'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getCsrfToken } from '@/lib/csrf';
import { CHILE_FINANCIAL_INSTITUTIONS } from '@/lib/financialCatalog';
import { buildChatDashboardForQuestion, compactDashboardForPrompt } from '@/lib/transactions-chat.helpers';
import { resolveInstantTransactionSummary } from '@/lib/transactions-summary.helpers';

import {
  ALL_PRODUCT_TEMPLATES,
  PRODUCT_STACK_PALETTE,
  PRODUCT_STACK_TEXT_PALETTE,
  TX_CATEGORY_OPTIONS,
  TX_MAX_SINGLE_FILE_BYTES,
  TX_MAX_TOTAL_FILE_BYTES,
} from './constants';
import { MAX_TRANSACTION_PRODUCTS_CREATED_TOTAL } from '../agent-page.constants';
import { useMovementAnalytics } from './use-movement-analytics';
import { TxEvidenceStep } from './TxEvidenceStep';
import { TxAnalystDashboard } from './TxAnalystDashboard';
import {
  NumericDust,
  buildUploadGuidance,
  confidenceBandLong,
  formatPercentCompact,
} from './presentation';
import { movementOverrideKey } from './taxonomy';
import type {
  BankProduct,
  TransactionsModalProps,
  TxUploadOnboardingStep,
  UploadStatementResult,
} from './types';
import type { TxDockTransitionPhase } from './presentation';
import { productVisualPalette } from './visuals';

export function TransactionsModal(props: TransactionsModalProps) {
  const [shuffleTrigger, setShuffleTrigger] = useState(0);
  const [pendingEvidenceFilesByProduct, setPendingEvidenceFilesByProduct] = useState<Record<string, File[]>>({});
  const [manualEvidenceDraftByProduct, setManualEvidenceDraftByProduct] = useState<Record<string, string>>({});
  const [txAssistantInputByProduct, setTxAssistantInputByProduct] = useState<Record<string, string>>({});
  const [txAssistantLoadingByProduct, setTxAssistantLoadingByProduct] = useState<Record<string, boolean>>({});
  const [txAssistantErrorByProduct, setTxAssistantErrorByProduct] = useState<Record<string, string | null>>({});
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [selectedMovementKey, setSelectedMovementKey] = useState<string | null>(null);
  const [overrideMerchantDraft, setOverrideMerchantDraft] = useState('');
  const [overrideCategoryDraft, setOverrideCategoryDraft] = useState<string>(TX_CATEGORY_OPTIONS[0]);
  const transactionsModalRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const txSendLockRef = useRef(false);
  const analytics = useMovementAnalytics(props.activeBankProduct, props.transactionTaxonomyOverrides);
  const {
    formatCurrency,
    isCreditCardProduct,
    dashboardClusters,
    alertDetails,
    metricExplanations,
    documentQualityRows,
    qualityAverage,
    categoryShareData,
    qualityRowsChart,
    dedupedMovementRows,
    incomeOrAbonoRows,
    expenseRows,
    incomeOrAbonoTotal,
    expenseTotal,
    tableDerivedMetrics,
    movementCount,
    netFlowFromTable,
    avgMovementFromTable,
    flowRatioFromTable,
    tablePeriod,
    summaryFromTable,
    verifiedTableRows,
    highConfidenceMovementCount,
    movementCoverageDisplay,
    enrichedCategoryData,
    txNarrative,
    categoryChartData,
    derivedTopMerchants,
    merchantConfidenceRows,
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
  const [recentlyDockedProductId, setRecentlyDockedProductId] = useState<string | null>(null);
  const [isDockingToLibrary, setIsDockingToLibrary] = useState(false);
  const [dockTransitionPhase, setDockTransitionPhase] = useState<TxDockTransitionPhase>('idle');
  const [transitionPulse, setTransitionPulse] = useState(0);
  const [txSummaryScrollDepth, setTxSummaryScrollDepth] = useState(0);
  const [txUploadOnboardingStep, setTxUploadOnboardingStep] = useState<TxUploadOnboardingStep>('format');
  const groupCarouselRef = useRef<HTMLDivElement | null>(null);
  const insightCarouselRef = useRef<HTMLDivElement | null>(null);
  const txSummaryScrollRef = useRef<HTMLDivElement | null>(null);
  const previousConnectedRef = useRef<Record<string, boolean>>({});
  const dockTransitionTimersRef = useRef<number[]>([]);
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

  const resolvedBank = quickBank.trim();
  const resolvedProductLabel = productTemplate.trim();
  const activeProductVisualPalette = productVisualPalette(
    `${props.activeBankProduct?.id ?? 'active'}-${resolvedProductLabel || props.activeBankProduct?.label || 'producto'}-${resolvedBank || props.activeBankProduct?.bank || 'bank'}`
  );
  const activeProductId = props.activeBankProduct?.id ?? null;
  const pendingEvidenceFiles = activeProductId ? pendingEvidenceFilesByProduct[activeProductId] ?? [] : [];
  const manualEvidenceDraft = activeProductId ? manualEvidenceDraftByProduct[activeProductId] ?? '' : '';
  const txAssistantInput = activeProductId ? txAssistantInputByProduct[activeProductId] ?? '' : '';
  const txAssistantLoading = activeProductId ? Boolean(txAssistantLoadingByProduct[activeProductId]) : false;
  const txAssistantError = activeProductId ? txAssistantErrorByProduct[activeProductId] ?? null : null;
  const currentStage: 'products' | 'consent' | 'evidence' | 'analyst' =
    props.txWizardStep === 'products'
      ? 'products'
      : props.txWizardStep === 'upload'
        ? 'evidence'
        : props.txWizardStep === 'dashboard'
          ? 'analyst'
          : 'consent';
  const parsedDocumentCount = props.activeBankProduct?.parsedDocuments.length ?? 0;
  const analysisAlreadyDone = parsedDocumentCount > 0;

  const setActivePendingEvidenceFiles = (updater: File[] | ((current: File[]) => File[])) => {
    if (!activeProductId) return;
    setPendingEvidenceFilesByProduct((prev) => {
      const current = prev[activeProductId] ?? [];
      const next = typeof updater === 'function' ? updater(current) : updater;
      return { ...prev, [activeProductId]: next };
    });
  };
  const setActiveManualEvidenceDraft = (value: string) => {
    if (!activeProductId) return;
    setManualEvidenceDraftByProduct((prev) => ({ ...prev, [activeProductId]: value }));
  };
  const setActiveTxAssistantInput = (value: string) => {
    if (!activeProductId) return;
    setTxAssistantInputByProduct((prev) => ({ ...prev, [activeProductId]: value }));
  };
  const setProductLoading = (productId: string, value: boolean) => {
    setTxAssistantLoadingByProduct((prev) => ({ ...prev, [productId]: value }));
  };
  const setProductError = (productId: string, value: string | null) => {
    setTxAssistantErrorByProduct((prev) => ({ ...prev, [productId]: value }));
  };
  const clearProductDraft = (productId: string) => {
    setPendingEvidenceFilesByProduct((prev) => ({ ...prev, [productId]: [] }));
    setManualEvidenceDraftByProduct((prev) => ({ ...prev, [productId]: '' }));
    setTxAssistantInputByProduct((prev) => ({ ...prev, [productId]: '' }));
    setTxAssistantErrorByProduct((prev) => ({ ...prev, [productId]: null }));
  };

  const applyOnboarding = () => {
    if (!props.activeBankProduct) return;
    props.updateActiveProduct({
      label: resolvedProductLabel,
      bank: resolvedBank,
      productType: derivedProductType,
      connected: Boolean(resolvedBank) && consentAccepted,
      randomMode: false,
    });
  };

  const requiredEvidenceText =
    derivedProductType === 'credit_card'
      ? 'Obligatorio: cartola de tarjeta (imagen o PDF). También puedes agregar un antecedente escrito manual si no quieres subir fotos.'
      : 'Recomendado: estado de cuenta/cartola en imagen, PDF, Excel o CSV. También puedes pegar un antecedente escrito manual.';

  const appendPendingEvidence = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!activeProductId) return;
    if (analysisAlreadyDone) {
      setProductError(activeProductId, 'Este producto ya fue analizado. Para nuevos antecedentes debes recrear el producto.');
      return;
    }
    const availableSlots = Math.max(
      0,
      props.maxEvidenceFilesPerProduct - (props.activeBankProduct?.uploadedFiles.length ?? 0),
    );
    if (availableSlots <= 0) {
      setProductError(activeProductId, `Este producto ya alcanzó el límite de ${props.maxEvidenceFilesPerProduct} archivos.`);
      return;
    }
    const next = Array.from(files);
    const merged = [...pendingEvidenceFiles];
    const oversizeNames: string[] = [];
    let exceededSlots = false;
    let exceededTotalBytes = false;
    let rollingBytes = merged.reduce((acc, file) => acc + file.size, 0);

    for (const file of next) {
      if (file.size > TX_MAX_SINGLE_FILE_BYTES) {
        oversizeNames.push(file.name);
        continue;
      }
      if (merged.some((existing) => existing.name === file.name && existing.size === file.size)) continue;
      if (merged.length >= availableSlots) {
        exceededSlots = true;
        continue;
      }
      if (rollingBytes + file.size > TX_MAX_TOTAL_FILE_BYTES) {
        exceededTotalBytes = true;
        continue;
      }
      merged.push(file);
      rollingBytes += file.size;
    }

    setActivePendingEvidenceFiles(merged);

    const notices: string[] = [];
    if (oversizeNames.length > 0) {
      const mbLimit = Math.round(TX_MAX_SINGLE_FILE_BYTES / (1024 * 1024));
      const preview = oversizeNames.slice(0, 2).join(', ');
      notices.push(
        `Algunos archivos superan ${mbLimit} MB por archivo (${preview}${oversizeNames.length > 2 ? ', ...' : ''}).`,
      );
    }
    if (exceededTotalBytes) {
      const mbLimit = Math.round(TX_MAX_TOTAL_FILE_BYTES / (1024 * 1024));
      notices.push(`El total adjunto no puede superar ${mbLimit} MB.`);
    }
    if (exceededSlots) {
      notices.push(`Límite por producto: ${props.maxEvidenceFilesPerProduct} archivos.`);
    }
    setProductError(activeProductId, notices.length > 0 ? notices.join(' ') : null);
  };

  const clearPendingEvidence = () => {
    if (!activeProductId) return;
    clearProductDraft(activeProductId);
  };

  const assistantMessages = props.activeBankProduct?.assistant?.messages ?? [];
  const summaryText = props.activeBankProduct?.assistant?.summaryText ?? null;
  const summaryGeneratedAt = props.activeBankProduct?.assistant?.summaryGeneratedAt ?? null;
  const summaryModel = props.activeBankProduct?.assistant?.summaryModel ?? null;
  const summaryRegenerationsUsed = Math.max(0, props.activeBankProduct?.assistant?.summaryRegenerationsUsed ?? 0);
  const summaryRegenerationsLeft = Math.max(0, 3 - summaryRegenerationsUsed);
  const selectedUploadFormat = props.activeBankProduct?.assistant?.uploadFormat ?? null;
  const hasSummary = Boolean(summaryText?.trim());
  const processingModeLabel = props.documentsLoading ? 'Procesando evidencia' : 'Pensando respuesta';
  const processingMetaLabel = props.documentsLoading ? 'OCR, normalización y conciliación' : 'Contexto, consistencia y respuesta';
  const processingPrimaryCopy = props.documentsLoading
    ? 'Leyendo archivos, detectando montos y consolidando movimientos.'
    : 'Revisando contexto del producto para responder mejor.';
  const processingSteps = props.documentsLoading
    ? ['Ingesta', 'Extracción', 'Validación']
    : ['Contexto', 'Consistencia', 'Respuesta'];

  const appendAssistantMessages = (
    productId: string,
    productSnapshot: BankProduct,
    nextMessages: Array<{ role: 'assistant' | 'user'; text: string; attachments?: string[] }>,
    extraPatch?: Partial<NonNullable<BankProduct['assistant']>>,
  ) => {
    if (nextMessages.length === 0) return;
    const baseMessages = productSnapshot.assistant?.messages ?? [];
    props.updateProductById(productId, {
      assistant: {
        messages: [
          ...baseMessages,
          ...nextMessages.map((message, index) => ({
            id: `${Date.now()}-${index}-${message.role}`,
            role: message.role,
            text: message.text,
            createdAt: new Date().toISOString(),
            attachments: message.attachments,
          })),
        ],
        uploadFormat: productSnapshot.assistant?.uploadFormat ?? null,
        summaryText: productSnapshot.assistant?.summaryText ?? null,
        summaryModel: productSnapshot.assistant?.summaryModel ?? null,
        summaryGeneratedAt: productSnapshot.assistant?.summaryGeneratedAt ?? null,
        summaryRegenerationsUsed: productSnapshot.assistant?.summaryRegenerationsUsed ?? 0,
        lastSummaryFeedback: productSnapshot.assistant?.lastSummaryFeedback ?? null,
        ...extraPatch,
      },
    });
  };
  const patchAssistant = (extraPatch: Partial<NonNullable<BankProduct['assistant']>>) => {
    if (!props.activeBankProduct) return;
    props.updateActiveProduct({
      assistant: {
        messages: props.activeBankProduct.assistant?.messages ?? [],
        uploadFormat: props.activeBankProduct.assistant?.uploadFormat ?? null,
        summaryText: props.activeBankProduct.assistant?.summaryText ?? null,
        summaryModel: props.activeBankProduct.assistant?.summaryModel ?? null,
        summaryGeneratedAt: props.activeBankProduct.assistant?.summaryGeneratedAt ?? null,
        summaryRegenerationsUsed: props.activeBankProduct.assistant?.summaryRegenerationsUsed ?? 0,
        lastSummaryFeedback: props.activeBankProduct.assistant?.lastSummaryFeedback ?? null,
        ...extraPatch,
      },
    });
  };

  const buildManualEvidenceFile = (text: string) =>
    new File([text], `antecedente-manual-${Date.now()}.txt`, { type: 'text/plain' });

  const maybeInitAssistant = () => {
    const product = props.activeBankProduct;
    if (!product?.connected) return;
    if ((product.assistant?.messages ?? []).length > 0) return;
    appendAssistantMessages(product.id, product, [
      {
        role: 'assistant',
        text: 'Antes de subir movimientos, dime cómo prefieres enviarlos: rápido, fotos, PDF, Excel/CSV o texto. Según eso te recomiendo la mejor forma para que el análisis salga limpio.',
      },
    ]);
  };

  const pendingManualEvidence = manualEvidenceDraft.trim();

  const hasTemplateChoice =
    productTemplate.trim().length > 0;
  const canContinueAuto =
    Boolean(resolvedBank.trim()) &&
    hasTemplateChoice &&
    consentAccepted;
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
  function clearDockTransitionTimers() {
    dockTransitionTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    dockTransitionTimersRef.current = [];
  }
  function queueDockTransitionTimeout(callback: () => void, delay: number) {
    const timerId = window.setTimeout(callback, delay);
    dockTransitionTimersRef.current.push(timerId);
  }
  function bumpModalMotion() {
    setShuffleTrigger((value) => value + 1);
    setTransitionPulse((value) => value + 1);
  }
  function startAuthorizationTransition() {
    if (!canContinueAuto || isDockingToLibrary || !props.activeBankProduct) return;
    clearDockTransitionTimers();
    const productId = props.activeBankProduct.id;
    setIsDockingToLibrary(true);
    setDockTransitionPhase('authorizing');
    bumpModalMotion();
    queueDockTransitionTimeout(() => setDockTransitionPhase('flood'), 220);
    queueDockTransitionTimeout(() => {
      applyOnboarding();
      setRecentlyDockedProductId(productId);
      props.simulateBankLogin({
        bank: resolvedBank,
        label: resolvedProductLabel,
        productType: derivedProductType,
        simulationAccepted: consentAccepted,
      });
    }, 520);
    queueDockTransitionTimeout(() => {
      setDockTransitionPhase('library-reveal');
      setShowTxCarousel(true);
      setActiveTxCard(1);
      props.setTxWizardStep('upload');
      setShuffleTrigger((value) => value + 1);
    }, 940);
    queueDockTransitionTimeout(() => {
      setDockTransitionPhase('chat-reveal');
      setShuffleTrigger((value) => value + 1);
      maybeInitAssistant();
    }, 1320);
    queueDockTransitionTimeout(() => {
      setIsDockingToLibrary(false);
      setRecentlyDockedProductId((current) => (current === productId ? null : current));
    }, 1960);
  }
  useEffect(() => {
    if (!props.isOpen) {
      clearDockTransitionTimers();
      setDockTransitionPhase('idle');
      setIsDockingToLibrary(false);
      setShowTxCarousel(false);
      return;
    }
    clearDockTransitionTimers();
    setDockTransitionPhase('idle');
    setIsDockingToLibrary(false);
    setShowTxCarousel(props.txWizardStep !== 'products');
  }, [props.isOpen, props.txWizardStep, props.activeBankProduct?.id, props.transactionProductCards]);
  useEffect(() => {
    const currentLabel = String(props.activeBankProduct?.label ?? '').trim();
    const looksLikeGenericLabel = /^producto\s+\d+$/i.test(currentLabel);
    setQuickBank(props.activeBankProduct?.bank ?? '');
    setProductTemplate(looksLikeGenericLabel ? '' : currentLabel);
    setSelectedMovementKey(null);
    setShowInstitutionCatalog(true);
    setShowTemplateCatalog(true);
  }, [props.activeBankProduct?.id, props.activeBankProduct?.bank, props.activeBankProduct?.label]);
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

  const activeDescriptor = props.transactionProductCards.find((entry) => entry.product.id === props.selectedProductId);
  const [productCarouselIndex, setProductCarouselIndex] = useState(0);
  const productCards = props.transactionProductCards;
  const libraryProductCards = productCards.filter(
    ({ product }) => product.connected || product.uploadedFiles.length > 0 || product.parsedDocuments.length > 0
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
  const txStages = useMemo(() => [
    {
      key: 'consent' as const,
      title: '1. Autorización',
      copy: 'Conecta institución y autoriza.',
      disabled: consentLocked,
      go: () => props.setTxWizardStep('credentials'),
    },
    {
      key: 'evidence' as const,
      title: '2. Evidencias',
      copy: 'Sube cartolas y respaldos.',
      disabled: !consentLocked,
      go: () => props.setTxWizardStep('upload'),
    },
    {
      key: 'analyst' as const,
      title: '3. Resumen',
      copy: 'Revisa la ficha analítica.',
      disabled: !consentLocked || !hasEvidence,
      go: () => hasEvidence && props.setTxWizardStep('dashboard'),
    },
  ], [consentLocked, hasEvidence, props.setTxWizardStep]);
  const [activeTxCard, setActiveTxCard] = useState(0);
  const currentTxStageIndex =
    props.txWizardStep === 'credentials'
      ? 0
      : props.txWizardStep === 'upload'
        ? 1
        : props.txWizardStep === 'dashboard'
          ? 2
          : -1;
  useEffect(() => {
    if (currentTxStageIndex >= 0) setActiveTxCard(currentTxStageIndex);
  }, [currentTxStageIndex]);
  useEffect(() => {
    if (currentTxStageIndex < 0) return;
    const stage = txStages[activeTxCard];
    if (!stage || stage.disabled) {
      if (activeTxCard !== currentTxStageIndex) setActiveTxCard(currentTxStageIndex);
      return;
    }
    if (activeTxCard !== currentTxStageIndex) stage.go();
  }, [activeTxCard, currentTxStageIndex, consentLocked, hasEvidence]);

  const goToTxStage = (stageKey: 'consent' | 'evidence' | 'analyst') => {
    const nextIndex = txStages.findIndex((stage) => stage.key === stageKey);
    const nextStage = nextIndex >= 0 ? txStages[nextIndex] : null;
    if (!nextStage || nextStage.disabled) return;
    setShowTxCarousel(true);
    setActiveTxCard(nextIndex);
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
    const nextMap: Record<string, boolean> = {};
    productCards.forEach(({ product }) => {
      nextMap[product.id] = Boolean(product.connected);
      if (!previousConnectedRef.current[product.id] && product.connected) {
        setRecentlyDockedProductId(product.id);
        window.setTimeout(() => setRecentlyDockedProductId((current) => (current === product.id ? null : current)), 900);
      }
    });
    previousConnectedRef.current = nextMap;
  }, [productCards]);
  useEffect(() => () => clearDockTransitionTimers(), []);
  useEffect(() => {
    if (!props.isOpen || props.txWizardStep !== 'upload' || isDockingToLibrary) return;
    maybeInitAssistant();
  }, [
    props.isOpen,
    props.txWizardStep,
    props.activeBankProduct?.id,
    props.activeBankProduct?.connected,
    isDockingToLibrary,
  ]);
  useEffect(() => {
    if (!props.isOpen || activeTxCard !== 2) return;
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
  }, [props.isOpen, activeTxCard, dashboardClusters.length, alertDetails.length, metricExplanations.length]);
  useEffect(() => {
    if (!props.isOpen) {
      clearDockTransitionTimers();
      setIsDockingToLibrary(false);
      setDockTransitionPhase('idle');
    }
  }, [props.isOpen]);
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
  }, [props.isOpen, summaryText, activeTxCard]);
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
    if (!props.isOpen || props.txWizardStep !== 'upload') return;
    if (analysisAlreadyDone) {
      setTxUploadOnboardingStep('upload');
      return;
    }
    if (selectedUploadFormat) {
      setTxUploadOnboardingStep('details');
      return;
    }
    setTxUploadOnboardingStep('format');
  }, [props.isOpen, props.txWizardStep, props.activeBankProduct?.id, analysisAlreadyDone, selectedUploadFormat]);
  useEffect(() => {
    if (props.isOpen) return;
    if (!activeProductId) return;
    setProductLoading(activeProductId, false);
    setProductError(activeProductId, null);
    txSendLockRef.current = false;
  }, [props.isOpen, activeProductId]);

  const txStageSummary = useMemo(() => {
    if (currentStage === 'products' || currentStage === 'consent') {
      return `Paso 1/3 · ${activeProductCreations}/${props.maxProducts} activos · ${props.productsCreatedTotal}/${MAX_TRANSACTION_PRODUCTS_CREATED_TOTAL} creados`;
    }
    if (currentStage === 'evidence') {
      return 'Paso 2 de 3: sube cartolas o respaldos y espera el análisis.';
    }
    return 'Paso 3 de 3: revisa el resumen y continúa con el agente principal.';
  }, [activeProductCreations, currentStage, props.maxProducts, props.productsCreatedTotal]);
  const txStageCta = useMemo(() => {
    if (currentStage === 'products') return 'Elige un producto o crea uno nuevo para continuar';
    if (currentStage === 'consent') {
      return canContinueAuto ? 'Autorizar y continuar' : 'Completa institución, plantilla y consentimiento';
    }
    if (currentStage === 'evidence') {
      return analysisAlreadyDone ? 'Resumen listo para revisar' : 'Sube evidencia para desbloquear el resumen';
    }
    return analysisAlreadyDone
      ? 'El contexto validado ya se sincroniza solo'
      : 'Guarda o analiza un producto para sincronizar contexto';
  }, [analysisAlreadyDone, canContinueAuto, currentStage]);

  const requestClose = useCallback(() => {
    const hasPending = pendingEvidenceFiles.length > 0 || pendingManualEvidence.length > 0;
    const isBusy = props.documentsLoading || txAssistantLoading;
    if (isBusy) {
      const confirmed = window.confirm(
        'Hay un análisis en curso. Si cierras ahora, el proceso puede quedar incompleto. ¿Cerrar el panel igual?',
      );
      if (!confirmed) return;
    } else if (hasPending) {
      const confirmed = window.confirm(
        'Tienes archivos o notas sin enviar. ¿Cerrar el panel y descartar ese borrador?',
      );
      if (!confirmed) return;
      clearPendingEvidence();
    }
    props.onClose();
  }, [
    clearPendingEvidence,
    pendingEvidenceFiles.length,
    pendingManualEvidence,
    props.documentsLoading,
    props.onClose,
    txAssistantLoading,
  ]);

  useEffect(() => {
    if (!props.isOpen) return;

    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const getFocusableElements = () => {
      const root = transactionsModalRef.current;
      if (!root) return [] as HTMLElement[];
      const selector = [
        'button:not([disabled])',
        '[href]',
        'input:not([disabled]):not([type="hidden"])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])',
      ].join(', ');
      return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(
        (node) => !node.hasAttribute('aria-hidden'),
      );
    };

    const rafId = window.requestAnimationFrame(() => {
      const focusables = getFocusableElements();
      (focusables[0] ?? transactionsModalRef.current)?.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        requestClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusables = getFocusableElements();
      if (focusables.length === 0) {
        event.preventDefault();
        transactionsModalRef.current?.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const inside = Boolean(active && transactionsModalRef.current?.contains(active));

      if (!inside) {
        event.preventDefault();
        first.focus();
        return;
      }
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
        return;
      }
      if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('keydown', onKeyDown);
      const elementToRestore = restoreFocusRef.current;
      if (elementToRestore && document.contains(elementToRestore)) {
        window.requestAnimationFrame(() => elementToRestore.focus());
      }
    };
  }, [props.isOpen, requestClose]);

  async function requestTransactionAssistant(payload: Record<string, unknown>) {
    const res = await fetch('/api/transactions-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken() || '' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) throw new Error(data?.error || 'No se pudo responder');
    return data;
  }

  async function refineTransactionSummaryFromFocus(source: string, focusText: string) {
    if (!props.activeBankProduct || !summaryText || summaryRegenerationsLeft <= 0 || txAssistantLoading) return;
    const clippedFocus = focusText.trim().replace(/\s+/g, ' ').slice(0, 320);
    if (!clippedFocus) return;
    await generateTransactionSummary({
      feedback: `Reanaliza con foco en ${source}: "${clippedFocus}". Verifica cálculo, categorización de comercios chilenos y consistencia global del resumen. Corrige el resumen final si detectas desvíos.`,
      isRegeneration: true,
    });
  }

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

  async function applyInstantTransactionSummary(options?: {
    uploadResult?: UploadStatementResult | null;
    feedback?: string;
    isRegeneration?: boolean;
    productId?: string;
    productSnapshot?: BankProduct;
  }) {
    const product = options?.productSnapshot ?? props.activeBankProduct;
    if (!product) return false;
    const productId = options?.productId ?? product.id;
    const priorRegenerations = product.assistant?.summaryRegenerationsUsed ?? 0;
    props.onDocumentsParseProgress?.({
      stage: 'summarizing',
      percent: 94,
      detail: 'Preparando resumen ejecutivo instantáneo.',
    });
    const uploadResult = options?.uploadResult ?? null;
    const dashboard = uploadResult?.dashboard ?? product.dashboard ?? null;
    const instantSummary = resolveInstantTransactionSummary(dashboard);
    if (!instantSummary) return false;

    props.updateProductById(productId, {
      assistant: {
        messages: [
          ...(product.assistant?.messages ?? []),
          {
            id: `${Date.now()}-assistant-summary`,
            role: 'assistant',
            text: options?.isRegeneration
              ? 'Revisé el producto de nuevo y actualicé el resumen de abajo.'
              : 'Ya recibí tus antecedentes. Preparé el resumen ejecutivo aquí abajo y puedo responder dudas sobre tus movimientos.',
            createdAt: new Date().toISOString(),
          },
        ],
        uploadFormat: product.assistant?.uploadFormat ?? null,
        summaryText: instantSummary,
        summaryModel: 'instant-heuristic',
        summaryGeneratedAt: new Date().toISOString(),
        summaryRegenerationsUsed: options?.isRegeneration ? priorRegenerations + 1 : priorRegenerations,
        lastSummaryFeedback: options?.feedback ?? null,
      },
      label: uploadResult?.product.label ?? product.label,
      bank: uploadResult?.product.bank ?? product.bank,
      productType: uploadResult?.product.productType ?? product.productType,
    });
    if (!options?.isRegeneration && productId === props.selectedProductId) {
      setActiveTxCard(2);
      props.setTxWizardStep('dashboard');
    }
    props.onDocumentsParseProgress?.({
      stage: 'complete',
      percent: 100,
      detail: 'Análisis listo.',
    });
    window.setTimeout(() => {
      props.onDocumentsParseProgress?.({
        stage: 'idle',
        percent: 0,
        detail: '',
      });
    }, 1400);
    return true;
  }

  async function generateTransactionSummary(options?: {
    feedback?: string;
    uploadResult?: UploadStatementResult | null;
    isRegeneration?: boolean;
    productId?: string;
    productSnapshot?: BankProduct;
  }) {
    const product = options?.productSnapshot ?? props.activeBankProduct;
    if (!product) return;
    const productId = options?.productId ?? product.id;
    const priorMessages = product.assistant?.messages ?? [];
    const priorRegenerations = product.assistant?.summaryRegenerationsUsed ?? 0;
    const priorSummary = product.assistant?.summaryText ?? null;
    const priorUploadFormat = product.assistant?.uploadFormat ?? null;
    const wantsLlmSummary = Boolean(options?.isRegeneration || options?.feedback?.trim());
    if (!wantsLlmSummary) {
      const applied = await applyInstantTransactionSummary({
        ...options,
        productId,
        productSnapshot: product,
      });
      if (applied) return;
    }

    setProductLoading(productId, true);
    setProductError(productId, null);
    props.onDocumentsParseProgress?.({
      stage: 'summarizing',
      percent: 92,
      detail: 'Regenerando resumen con el modelo analítico.',
    });
    try {
      const uploadResult = options?.uploadResult ?? null;
      const response = await requestTransactionAssistant({
        mode: 'summary',
        product: {
          bank: uploadResult?.product.bank ?? product.bank,
          label: uploadResult?.product.label ?? product.label,
          productType: uploadResult?.product.productType ?? product.productType,
        },
        parsedDocuments: uploadResult?.documents ?? product.parsedDocuments ?? [],
        dashboard:
          uploadResult?.dashboard ??
          compactDashboardForPrompt(effectiveDashboard, { maxMovements: 80, maxMerchants: 10 }) ??
          null,
        currentSummary: priorSummary,
        feedback: options?.feedback ?? '',
      });
      props.updateProductById(productId, {
        assistant: {
          messages: [
            ...priorMessages,
            {
              id: `${Date.now()}-assistant-summary`,
              role: 'assistant',
              text: options?.isRegeneration
                ? 'Revisé el producto de nuevo y actualicé el resumen de abajo.'
                : 'Ya recibí tus antecedentes. Preparé el resumen ejecutivo aquí abajo y puedo responder dudas sobre tus movimientos.',
              createdAt: new Date().toISOString(),
            },
          ],
          uploadFormat: priorUploadFormat,
          summaryText: String(response.summary ?? '').trim(),
          summaryModel: typeof response.model === 'string' ? response.model : null,
          summaryGeneratedAt: new Date().toISOString(),
          summaryRegenerationsUsed: options?.isRegeneration ? priorRegenerations + 1 : priorRegenerations,
          lastSummaryFeedback: options?.feedback ?? null,
        },
        label: uploadResult?.product.label ?? product.label,
        bank: uploadResult?.product.bank ?? product.bank,
        productType: uploadResult?.product.productType ?? product.productType,
      });
      if (!options?.isRegeneration && productId === props.selectedProductId) {
        setActiveTxCard(2);
        props.setTxWizardStep('dashboard');
      }
      props.onDocumentsParseProgress?.({
        stage: 'complete',
        percent: 100,
        detail: 'Resumen actualizado.',
      });
    } catch (error) {
      setProductError(productId, error instanceof Error ? error.message : 'No se pudo generar el resumen.');
    } finally {
      setProductLoading(productId, false);
    }
  }

  async function handleAssistantUploadSend(messageText: string) {
    const product = props.activeBankProduct;
    if (!product) return;
    const productId = product.id;
    const manualFile =
      pendingManualEvidence.length > 0 ? buildManualEvidenceFile(pendingManualEvidence) : null;
    const filesToUpload = manualFile ? [...pendingEvidenceFiles, manualFile] : pendingEvidenceFiles;
    if (filesToUpload.length === 0) return;

    setProductLoading(productId, true);
    setProductError(productId, null);
    try {
      appendAssistantMessages(productId, product, [
        {
          role: 'user',
          text: messageText || 'Te envío antecedentes de transacciones.',
          attachments: filesToUpload.map((file) => file.name),
        },
      ]);
      const result = await props.onUploadStatement(filesToUpload);
      if (result?.documents?.length) {
        await generateTransactionSummary({
          uploadResult: result,
          isRegeneration: false,
          productId,
          productSnapshot: {
            ...product,
            parsedDocuments: result.documents,
            dashboard: result.dashboard ?? product.dashboard,
            label: result.product.label,
            bank: result.product.bank,
            productType: result.product.productType,
          },
        });
      }
      clearProductDraft(productId);
    } catch (error) {
      setProductError(productId, error instanceof Error ? error.message : 'No se pudo enviar evidencia.');
    } finally {
      setProductLoading(productId, false);
    }
  }

  async function handleAssistantTextSend() {
    if (!props.activeBankProduct || txAssistantLoading || txSendLockRef.current) return;
    const product = props.activeBankProduct;
    const productId = product.id;
    const productSummaryText = product.assistant?.summaryText ?? null;
    const productRegenerationsUsed = product.assistant?.summaryRegenerationsUsed ?? 0;
    const productRegenerationsLeft = Math.max(0, 3 - productRegenerationsUsed);
    const productMessages = product.assistant?.messages ?? [];
    const text = txAssistantInput.trim();
    const hasFiles = pendingEvidenceFiles.length > 0 || pendingManualEvidence.length > 0;
    if (!text && !hasFiles) return;
    txSendLockRef.current = true;
    try {
      const normalized = text.toLowerCase();
      const chosenFormat =
        /video|grabaci[oó]n|pantalla|screen/.test(normalized)
          ? 'video'
          : /excel|csv|xlsx|planilla/.test(normalized)
            ? 'spreadsheet'
            : /\bpdf\b/.test(normalized)
              ? 'pdf'
              : /foto|captura|pantallazo|imagen/.test(normalized)
                ? 'photos'
                : /texto|manual|escrito/.test(normalized)
                  ? 'text'
                  : null;

      if (hasFiles) {
        await handleAssistantUploadSend(text);
        return;
      }

      appendAssistantMessages(productId, product, [{ role: 'user', text }]);
      setTxAssistantInputByProduct((prev) => ({ ...prev, [productId]: '' }));
      setProductError(productId, null);

      const withUserMessage: BankProduct = {
        ...product,
        assistant: {
          messages: [
            ...productMessages,
            {
              id: `${Date.now()}-user`,
              role: 'user',
              text,
              createdAt: new Date().toISOString(),
            },
          ],
          uploadFormat: product.assistant?.uploadFormat ?? null,
          summaryText: productSummaryText,
          summaryModel: product.assistant?.summaryModel ?? null,
          summaryGeneratedAt: product.assistant?.summaryGeneratedAt ?? null,
          summaryRegenerationsUsed: productRegenerationsUsed,
          lastSummaryFeedback: product.assistant?.lastSummaryFeedback ?? null,
        },
      };

      if (chosenFormat) {
        appendAssistantMessages(
          productId,
          withUserMessage,
          [{ role: 'assistant', text: buildUploadGuidance(chosenFormat, product.productType) }],
          { uploadFormat: chosenFormat },
        );
        return;
      }

      const asksForRegeneration =
        Boolean(productSummaryText) &&
        /(error|corrige|corregir|revisa|revisar|regenera|regenerar|rehace|rehacer)/i.test(text);
      if (asksForRegeneration && productRegenerationsLeft > 0) {
        await generateTransactionSummary({
          feedback: text,
          isRegeneration: true,
          productId,
          productSnapshot: withUserMessage,
        });
        return;
      }

      setProductLoading(productId, true);
      setProductError(productId, null);
      const chatDashboard =
        buildChatDashboardForQuestion(effectiveDashboard, text) ??
        compactDashboardForPrompt(effectiveDashboard, { maxMovements: 24, maxMerchants: 8 });
      const response = await requestTransactionAssistant({
        mode: 'chat',
        question: text,
        product: {
          bank: product.bank,
          label: product.label,
          productType: product.productType,
        },
        currentSummary: productSummaryText,
        dashboard: chatDashboard,
        parsedDocuments: [],
        messages: [...productMessages, { role: 'user', text }],
      });
      appendAssistantMessages(withUserMessage.id, withUserMessage, [
        { role: 'assistant', text: String(response.assistant_text ?? 'Listo.') },
      ]);
    } catch (error) {
      setProductError(productId, error instanceof Error ? error.message : 'No se pudo responder.');
    } finally {
      setProductLoading(productId, false);
      txSendLockRef.current = false;
    }
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
      >
        <ModalNumbersCanvas
          shuffleTrigger={shuffleTrigger}
          transitionPhase={dockTransitionPhase}
          pulse={transitionPulse}
        />
        <div className="tx-transition-flood-layer" aria-hidden="true">
          <NumericDust scope="flood" pulse={transitionPulse} active={dockTransitionPhase !== 'idle'} count={42} />
        </div>
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
        <div className="tx-scroll-body">
        <p id="transactions-modal-intro" className="agent-modal-intro tx-modal-header-layer">
          Conecta cada producto, sube cartolas y revisa el resumen analítico. El contexto validado se sincroniza solo.
        </p>
        <section className="pt-shell tx-stage-shell tx-modal-header-layer">
          <aside className="pt-left tx-panel-surface tx-panel-surface--library">
            <NumericDust scope="library" pulse={transitionPulse} active={dockTransitionPhase !== 'idle'} />
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
                      return (
                        <div
                          key={product.id}
                          role="button"
                          tabIndex={0}
                          className={`pt-item pt-item-stack tx-lib-card ${isTop ? 'is-active is-top' : ''} ${recentlyDockedProductId === product.id ? 'tx-lib-enter' : ''}`}
                          data-docked={recentlyDockedProductId === product.id ? 'true' : 'false'}
                          onClick={() => {
                            selectLibraryProductAt(productCarouselIndex + stackIndex);
                          }}
                          onKeyDown={(e) => {
                            if (e.key !== 'Enter' && e.key !== ' ') return;
                            e.preventDefault();
                            selectLibraryProductAt(productCarouselIndex + stackIndex);
                          }}
                          style={{
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
                          {recentlyDockedProductId === product.id ? (
                            <NumericDust scope="library-card" pulse={transitionPulse} active count={18} />
                          ) : null}
                          {isTop ? (
                            <button
                              type="button"
                              className="pt-item-delete-mini"
                              aria-label={`Eliminar ${product.label}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                props.deleteTransactionProduct(product.id);
                              }}
                            >
                              ×
                            </button>
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
                  <p>Las cards aparecen aquí cuando el producto ya quedó guardado en el flujo.</p>
                </div>
              )}
            </div>
          </aside>

          <div className={`pt-right tx-panel-surface tx-panel-surface--workspace ${!props.activeBankProduct || showTxCarousel ? '' : 'tx-only-cta'}`}>
            <NumericDust scope="workspace" pulse={transitionPulse} active={dockTransitionPhase !== 'idle' || currentStage !== 'consent'} />
            <div className="tx-meta-card is-neutral" role="status" aria-live="polite" style={{ marginBottom: 14 }}>
              <span className="tx-meta-card-kicker">Estado del flujo</span>
              <p>{txStageSummary}</p>
              <p>{txStageCta}</p>
            </div>
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
                  {(activeTxCard === 0 || (activeTxCard === 1 && isDockingToLibrary)) && (
                  <div className="tx-3d-hero-shell" aria-hidden="true">
                    <div className="relative w-full flex items-center justify-center p-0">
                      <div className="relative w-full py-0">
                      <div className={`tx-3d-sway-wrap${txVisualStage === 'consent' && !isDockingToLibrary ? ' is-floating' : ''}`}>
                      <div
                        className={`tx-3d-hero ${txVisualTone} ${isCardLikeProduct ? 'is-card-like' : 'is-generic-like'} ${activeTxCard % 2 === 1 ? 'is-solid-step' : 'is-anim-step'} ${isDockingToLibrary ? 'is-docking-out' : ''}`}
                        style={{
                          ['--tx-hero-base' as any]: activeProductVisualPalette.base,
                          ['--tx-hero-glow' as any]: activeProductVisualPalette.glow,
                          ['--tx-hero-edge' as any]: activeProductVisualPalette.edge,
                          ['--tx-hero-tint' as any]: activeProductVisualPalette.tint,
                          transform: `translate3d(0, ${txVisualY}px, 0) rotateX(${txVisualRotateX}deg) rotateY(${txVisualRotateY}deg) scale(${txVisualScale})`,
                        }}
                      >
                        <NumericDust scope="hero" pulse={transitionPulse} active={dockTransitionPhase !== 'idle'} />
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
                  {activeTxCard === 1 && !isDockingToLibrary && (
                    <div className="tx-hero-shell-spacer" aria-hidden="true" />
                  )}
                  {activeTxCard === 0 && (
                  <section className="tx-content-card is-main-center tx-summary-clean tx-step-reveal">
                    <div className="pt-stage-header">
                      <span className="pt-stage-eyebrow">Paso 1</span>
                      <h4>Autorización del producto</h4>
                      <p>Define institución, tipo y consentimiento para iniciar el flujo simulado.</p>
                    </div>
                    <div className="transactions-summary-card tx-consent-card">
                    <span className="transactions-summary-title">Consentimiento Open Finance (simulado)</span>
                    <div className="bank-sim-grid">
                      <label>Institución (sugerida)
                        <div className="tx-picker-field">
                          <input
                            value={quickBank}
                            onChange={(e) => {
                              setQuickBank(e.target.value);
                              setShowInstitutionCatalog(true);
                            }}
                            onFocus={() => setShowInstitutionCatalog(true)}
                            placeholder="Busca o escribe una institución"
                          />
                          <button
                            type="button"
                            className="tx-picker-toggle"
                            onClick={() => setShowInstitutionCatalog((prev) => !prev)}
                          >
                            {showInstitutionCatalog ? 'Ocultar catálogo' : 'Ver catálogo'}
                          </button>
                          {showInstitutionCatalog && (
                            <div className="tx-picker-catalog">
                              {filteredInstitutions.map((institution) => (
                                <button
                                  key={institution}
                                  type="button"
                                  className="tx-picker-option"
                                  onClick={() => {
                                    setQuickBank(`${institution} (simulacion)`);
                                    setShowInstitutionCatalog(false);
                                  }}
                                >
                                  {institution}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </label>
                      <label>Plantilla de producto o servicio
                        <div className="tx-picker-field">
                          <input
                            value={productTemplate}
                            onChange={(e) => {
                              setProductTemplate(e.target.value);
                              setShowTemplateCatalog(true);
                            }}
                            onFocus={() => setShowTemplateCatalog(true)}
                            placeholder="Busca o escribe una plantilla"
                          />
                          <button
                            type="button"
                            className="tx-picker-toggle"
                            onClick={() => setShowTemplateCatalog((prev) => !prev)}
                          >
                            {showTemplateCatalog ? 'Ocultar catálogo' : 'Ver catálogo'}
                          </button>
                          {showTemplateCatalog && (
                            <div className="tx-picker-catalog">
                              {filteredTemplates.map((template) => (
                                <button
                                  key={template.label}
                                  type="button"
                                  className="tx-picker-option"
                                  onClick={() => {
                                    setProductTemplate(template.label);
                                    setShowTemplateCatalog(false);
                                  }}
                                >
                                  {template.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </label>
                      <button
                        type="button"
                        className={`tx-consent-toggle ${consentAccepted ? 'is-checked' : ''}`}
                        role="checkbox"
                        aria-checked={consentAccepted}
                        onClick={() => {
                          const nextAccepted = !consentAccepted;
                          setConsentAccepted(nextAccepted);
                          props.updateActiveProduct({
                            simulationAccepted: nextAccepted,
                            connected: false,
                          });
                        }}
                      >
                        <span className="tx-consent-toggle-box" aria-hidden="true" />
                        <span className="tx-consent-toggle-copy">
                          Autorizo el análisis de datos en ambiente simulado (sin credenciales reales).
                        </span>
                      </button>
                      <div className="tx-consent-inline-actions">
                      </div>
                    </div>
                    <div className="agent-modal-actions tx-consent-actions-row">
                      <button type="button" className="continue-ghost tx-delete-product-btn" onClick={() => props.deleteTransactionProduct(props.activeBankProduct!.id)}>Eliminar producto</button>
                      <button
                        type="button"
                        className="button-primary tx-consent-continue-main"
                        disabled={!canContinueAuto || isDockingToLibrary}
                        onClick={startAuthorizationTransition}
                      >
                        {isDockingToLibrary ? 'Autorizando…' : 'Autorizar y continuar'}
                      </button>
                    </div>
                    </div>
                  </section>
                  )}

                  {activeTxCard === 1 && props.activeBankProduct && (
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
                      manualEvidenceDraft={manualEvidenceDraft}
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
                      pendingManualEvidence={pendingManualEvidence}
                      onPatchUploadFormat={(format) => patchAssistant({ uploadFormat: format })}
                      onResetUploadFormat={() => patchAssistant({ uploadFormat: null })}
                      onSetUploadOnboardingStep={setTxUploadOnboardingStep}
                      onBumpTransitionPulse={() => setTransitionPulse((value) => value + 1)}
                      onAppendPendingEvidence={appendPendingEvidence}
                      onManualEvidenceChange={setActiveManualEvidenceDraft}
                      onAssistantInputChange={setActiveTxAssistantInput}
                      onAssistantSend={() => void handleAssistantTextSend()}
                      onRefineSummary={(source, body) => void refineTransactionSummaryFromFocus(source, body)}
                      onGoToAnalyst={() => goToTxStage('analyst')}
                      onRegenerateSummary={() =>
                        void generateTransactionSummary({
                          feedback: 'Revisar nuevamente consistencia de movimientos y resumen.',
                          isRegeneration: true,
                        })
                      }
                    />
                  )}

                  {activeTxCard === 2 && props.activeBankProduct && (
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
                        props.saveTransactionProductForBatch();
                        props.setTxWizardStep('products');
                        setShowTxCarousel(false);
                      }}
                      onRefineSummary={(source, body) => void refineTransactionSummaryFromFocus(source, body)}
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
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalTree, document.body);
}
import ModalNumbersCanvas from '@/components/agent/ModalNumbersCanvas';
