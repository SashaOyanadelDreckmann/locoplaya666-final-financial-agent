'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import { getCsrfToken } from '@/lib/csrf';
import { countProductsWithAnalyzedMovements } from '@/lib/transactions-flow.helpers';
import { CHILE_FINANCIAL_INSTITUTIONS } from '@/lib/financialCatalog';
import ModalNumbersCanvas from '@/components/agent/ModalNumbersCanvas';
import {
  RETRO_CHART_COLORS,
  RETRO_CHART_NEGATIVE,
  RETRO_GRID,
  RETRO_TICK,
  RETRO_TOOLTIP_STYLE,
  RetroBarShape,
  RetroDot,
} from '@/components/ui/retro-chart';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts';

import {
  ALL_PRODUCT_TEMPLATES,
  PRODUCT_STACK_PALETTE,
  PRODUCT_STACK_TEXT_PALETTE,
  TX_CATEGORY_OPTIONS,
  TX_MAX_SINGLE_FILE_BYTES,
  TX_MAX_TOTAL_FILE_BYTES,
} from './constants';
import { useMovementAnalytics } from './use-movement-analytics';
import { TxEvidenceStep } from './TxEvidenceStep';
import { TxAnalystDashboard } from './TxAnalystDashboard';
import {
  EditorialSummary,
  NumericDust,
  buildEditorialSummaryBlocks,
  buildUploadGuidance,
  confidenceBand,
  confidenceBandLong,
  formatPercentCompact,
  getFormatLabel,
  getFormatMicrocopy,
  movementSourceLabel,
  renderFormatIcon,
} from './presentation';
import { movementOverrideKey, normalizeTaxonomyKey, resolveTransactionOverride } from './taxonomy';
import type {
  BankProduct,
  TransactionsModalProps,
  TxUploadOnboardingStep,
  UploadStatementResult,
} from './types';
import type { TxDockTransitionPhase } from './presentation';

export function TransactionsModal(props: TransactionsModalProps) {
  const hexToRgba = (hex: string, alpha: number) => {
    const normalized = hex.replace('#', '').trim();
    if (!/^[\da-f]{6}$/i.test(normalized)) return `rgba(59, 91, 122, ${alpha})`;
    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };
  const [shuffleTrigger, setShuffleTrigger] = useState(0);
  const [pendingEvidenceFiles, setPendingEvidenceFiles] = useState<File[]>([]);
  const [manualEvidenceDraft, setManualEvidenceDraft] = useState('');
  const [txAssistantInput, setTxAssistantInput] = useState('');
  const [txAssistantLoading, setTxAssistantLoading] = useState(false);
  const [txAssistantError, setTxAssistantError] = useState<string | null>(null);
  const [showInjectProductsConfirm, setShowInjectProductsConfirm] = useState(false);
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
  const productStackColor = (seed: string) => {
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) hash = (hash << 5) - hash + seed.charCodeAt(i);
    return PRODUCT_STACK_PALETTE[Math.abs(hash) % PRODUCT_STACK_PALETTE.length];
  };
  const productVisualPalette = (seed: string) => {
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) hash = (hash << 5) - hash + seed.charCodeAt(i);
    const hue = Math.abs(hash) % 360;
    const glowHue = (hue + 24) % 360;
    return {
      base: `hsl(${hue} 44% 22%)`,
      glow: `hsla(${glowHue} 90% 70% / 0.26)`,
      edge: `hsla(${hue} 86% 84% / 0.2)`,
      tint: `hsla(${glowHue} 100% 95% / 0.94)`,
    };
  };
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

  const currentStage: 'consent' | 'evidence' | 'analyst' =
    props.txWizardStep === 'upload' ? 'evidence' : props.txWizardStep === 'dashboard' ? 'analyst' : 'consent';

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
    if (analysisAlreadyDone) {
      setTxAssistantError('Este producto ya fue analizado. Para nuevos antecedentes debes recrear el producto.');
      return;
    }
    const availableSlots = Math.max(
      0,
      props.maxEvidenceFilesPerProduct - (props.activeBankProduct?.uploadedFiles.length ?? 0),
    );
    if (availableSlots <= 0) {
      setTxAssistantError(
        `Este producto ya alcanzó el límite de ${props.maxEvidenceFilesPerProduct} archivos.`,
      );
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

    setPendingEvidenceFiles(merged);

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
    setTxAssistantError(notices.length > 0 ? notices.join(' ') : null);
  };

  const clearPendingEvidence = () => {
    setPendingEvidenceFiles([]);
    setManualEvidenceDraft('');
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
    nextMessages: Array<{ role: 'assistant' | 'user'; text: string; attachments?: string[] }>,
    extraPatch?: Partial<NonNullable<BankProduct['assistant']>>,
  ) => {
    if (!props.activeBankProduct || nextMessages.length === 0) return;
    const baseMessages = props.activeBankProduct.assistant?.messages ?? [];
    props.updateActiveProduct({
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

  const formatChoiceLabel = (format: 'photos' | 'pdf' | 'spreadsheet' | 'text') =>
    format === 'photos' ? 'fotos' : format === 'pdf' ? 'PDF' : format === 'spreadsheet' ? 'Excel/CSV' : 'texto';

  const buildManualEvidenceFile = (text: string) =>
    new File([text], `antecedente-manual-${Date.now()}.txt`, { type: 'text/plain' });

  const maybeInitAssistant = () => {
    if (!props.activeBankProduct?.connected) return;
    if ((props.activeBankProduct.assistant?.messages ?? []).length > 0) return;
    appendAssistantMessages([
      {
        role: 'assistant',
        text: 'Antes de subir movimientos, dime cómo prefieres enviarlos: fotos, PDF, Excel/CSV o texto. Según eso te recomiendo la mejor forma para que el análisis salga limpio.',
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
  const parsedDocumentCount = props.activeBankProduct?.parsedDocuments.length ?? 0;
  const isSavedForBatch = Boolean(
    props.activeBankProduct &&
    props.activeBankProduct.connected &&
    props.savedProductIds.includes(props.activeBankProduct.id)
  );
  const analysisAlreadyDone = parsedDocumentCount > 0;
  const remainingProductCreations = Math.max(0, props.maxProducts - props.productsCreatedTotal);
  const canAddMoreProducts = remainingProductCreations > 0;
  const consentLocked = Boolean(props.activeBankProduct?.connected);
  const recommendedTxProducts: Array<{ title: string; bank: string; template: string }> = [
    { title: 'Tarjeta de crédito', bank: 'Banco BICE', template: 'Tarjeta de crédito' },
    { title: 'Cuenta corriente', bank: 'Banco de Chile', template: 'Cuenta corriente' },
    { title: 'Cuenta vista', bank: 'BancoEstado', template: 'Cuenta vista' },
  ];

  function handleCreateProduct() {
    if (!canAddMoreProducts) return;
    props.addTransactionProduct();
    setQuickBank('');
    setProductTemplate('');
    setShowInstitutionCatalog(false);
    setShowTemplateCatalog(false);
    setShowTxCarousel(true);
    props.setTxWizardStep('credentials');
  }

  function openAuthorizationWithPreset(preset?: { bank: string; template: string }) {
    if (preset) {
      setQuickBank('');
      setProductTemplate(preset.template);
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
  function startAuthorizationTransition() {
    if (!canContinueAuto || isDockingToLibrary || !props.activeBankProduct) return;
    clearDockTransitionTimers();
    const productId = props.activeBankProduct.id;
    setIsDockingToLibrary(true);
    setDockTransitionPhase('authorizing');
    setTransitionPulse((value) => value + 1);
    setShuffleTrigger((value) => value + 1);
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
    if (!props.isOpen) return;
    clearDockTransitionTimers();
    setDockTransitionPhase('idle');
    setIsDockingToLibrary(false);
    const hasLibrary = props.transactionProductCards.some(
      ({ product }) =>
        product.connected || product.uploadedFiles.length > 0 || product.parsedDocuments.length > 0,
    );
    setShowTxCarousel(hasLibrary || Boolean(props.activeBankProduct?.connected));
  }, [props.isOpen, props.activeBankProduct?.connected, props.transactionProductCards]);
  useEffect(() => {
    const currentLabel = String(props.activeBankProduct?.label ?? '').trim();
    const looksLikeGenericLabel = /^producto\s+\d+$/i.test(currentLabel);
    setQuickBank(props.activeBankProduct?.bank ?? '');
    setProductTemplate(looksLikeGenericLabel ? '' : currentLabel);
    setShowInstitutionCatalog(true);
    setShowTemplateCatalog(true);
  }, [props.activeBankProduct?.id]);
  useEffect(() => {
    if (!props.isOpen || currentStage !== 'consent' || !showTxCarousel) return;
    setShowInstitutionCatalog(true);
    setShowTemplateCatalog(true);
  }, [props.isOpen, currentStage, showTxCarousel, props.activeBankProduct?.id]);
  const matchingInstitutions = CHILE_FINANCIAL_INSTITUTIONS
    .filter((institution) =>
      quickBank.trim().length === 0
        ? true
        : institution.toLowerCase().includes(quickBank.toLowerCase().replace(/\s*\(simulacion\)\s*/gi, '').trim())
    );
  const filteredInstitutions =
    (matchingInstitutions.length > 0 ? matchingInstitutions : CHILE_FINANCIAL_INSTITUTIONS).slice(0, 24);
  const matchingTemplates = ALL_PRODUCT_TEMPLATES
    .filter((template) =>
      productTemplate.trim().length === 0
        ? true
        : template.label.toLowerCase().includes(productTemplate.toLowerCase().trim())
    );
  const filteredTemplates =
    (matchingTemplates.length > 0 ? matchingTemplates : ALL_PRODUCT_TEMPLATES).slice(0, 24);

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
    setShowTxCarousel(true);
    setProductCarouselIndex(nextIndex);
    props.selectTransactionProduct(nextProduct.id);
  };
  const txStages = [
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
  ];
  const [activeTxCard, setActiveTxCard] = useState(0);
  const currentTxStageIndex = txStages.findIndex((stage) => stage.key === currentStage);
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
    if (!props.isOpen) setShowInjectProductsConfirm(false);
  }, [props.isOpen]);
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
  }, [selectedMovementKey, selectedMovement?.merchant, selectedMovement?.label, selectedMovement?.category]);
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
    setTxAssistantLoading(false);
    setTxAssistantError(null);
    txSendLockRef.current = false;
  }, [props.isOpen]);

  const analyzedProductsCount = useMemo(
    () => countProductsWithAnalyzedMovements(props.transactionProductCards.map(({ product }) => product)),
    [props.transactionProductCards],
  );
  const canInjectToAgent = analyzedProductsCount > 0;

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

  async function generateTransactionSummary(options?: { feedback?: string; uploadResult?: UploadStatementResult | null; isRegeneration?: boolean }) {
    if (!props.activeBankProduct) return;
    setTxAssistantLoading(true);
    setTxAssistantError(null);
    try {
      const uploadResult = options?.uploadResult ?? null;
      const response = await requestTransactionAssistant({
        mode: 'summary',
        product: {
          bank: uploadResult?.product.bank ?? props.activeBankProduct.bank,
          label: uploadResult?.product.label ?? props.activeBankProduct.label,
          productType: uploadResult?.product.productType ?? props.activeBankProduct.productType,
        },
        parsedDocuments: uploadResult?.documents ?? props.activeBankProduct.parsedDocuments ?? [],
        dashboard: uploadResult?.dashboard ?? effectiveDashboard ?? null,
        currentSummary: summaryText,
        feedback: options?.feedback ?? '',
      });
      props.updateActiveProduct({
        assistant: {
          messages: [
            ...(props.activeBankProduct.assistant?.messages ?? []),
            {
              id: `${Date.now()}-assistant-summary`,
              role: 'assistant',
              text: options?.isRegeneration
                ? 'Revisé el producto de nuevo y actualicé el resumen de abajo.'
                : 'Ya recibí tus antecedentes. Preparé el resumen ejecutivo aquí abajo y puedo responder dudas sobre tus movimientos.',
              createdAt: new Date().toISOString(),
            },
          ],
          uploadFormat: props.activeBankProduct.assistant?.uploadFormat ?? null,
          summaryText: String(response.summary ?? '').trim(),
          summaryModel: typeof response.model === 'string' ? response.model : null,
          summaryGeneratedAt: new Date().toISOString(),
          summaryRegenerationsUsed: options?.isRegeneration ? summaryRegenerationsUsed + 1 : summaryRegenerationsUsed,
          lastSummaryFeedback: options?.feedback ?? null,
        },
        label: uploadResult?.product.label ?? props.activeBankProduct.label,
        bank: uploadResult?.product.bank ?? props.activeBankProduct.bank,
        productType: uploadResult?.product.productType ?? props.activeBankProduct.productType,
      });
      if (!options?.isRegeneration) {
        setActiveTxCard(2);
        props.setTxWizardStep('dashboard');
      }
    } catch (error) {
      setTxAssistantError(error instanceof Error ? error.message : 'No se pudo generar el resumen.');
    } finally {
      setTxAssistantLoading(false);
    }
  }

  async function handleAssistantUploadSend(messageText: string) {
    if (!props.activeBankProduct) return;
    const manualFile =
      pendingManualEvidence.length > 0 ? buildManualEvidenceFile(pendingManualEvidence) : null;
    const filesToUpload = manualFile ? [...pendingEvidenceFiles, manualFile] : pendingEvidenceFiles;
    if (filesToUpload.length === 0) return;

    setTxAssistantLoading(true);
    setTxAssistantError(null);
    try {
      appendAssistantMessages([
        {
          role: 'user',
          text: messageText || 'Te envío antecedentes de transacciones.',
          attachments: filesToUpload.map((file) => file.name),
        },
      ]);
      const result = await props.onUploadStatement(filesToUpload);
      if (result?.documents?.length) {
        await generateTransactionSummary({ uploadResult: result, isRegeneration: false });
      }
      setTxAssistantInput('');
      clearPendingEvidence();
    } catch (error) {
      setTxAssistantError(error instanceof Error ? error.message : 'No se pudo enviar evidencia.');
    } finally {
      setTxAssistantLoading(false);
    }
  }

  async function handleAssistantTextSend() {
    if (!props.activeBankProduct || txAssistantLoading || txSendLockRef.current) return;
    const text = txAssistantInput.trim();
    const hasFiles = pendingEvidenceFiles.length > 0 || pendingManualEvidence.length > 0;
    if (!text && !hasFiles) return;
    txSendLockRef.current = true;
    try {
      const normalized = text.toLowerCase();
      const chosenFormat =
        /excel|csv|xlsx|planilla/.test(normalized)
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

      appendAssistantMessages([{ role: 'user', text }]);
      setTxAssistantInput('');
      setTxAssistantError(null);

      if (chosenFormat) {
        appendAssistantMessages(
          [{ role: 'assistant', text: buildUploadGuidance(chosenFormat, props.activeBankProduct.productType) }],
          { uploadFormat: chosenFormat },
        );
        return;
      }

      const asksForRegeneration =
        Boolean(summaryText) &&
        /(error|corrige|corregir|revisa|revisar|regenera|regenerar|rehace|rehacer)/i.test(text);
      if (asksForRegeneration && summaryRegenerationsLeft > 0) {
        await generateTransactionSummary({ feedback: text, isRegeneration: true });
        return;
      }

      setTxAssistantLoading(true);
      const response = await requestTransactionAssistant({
        mode: 'chat',
        product: {
          bank: props.activeBankProduct.bank,
          label: props.activeBankProduct.label,
          productType: props.activeBankProduct.productType,
        },
        currentSummary: summaryText,
        dashboard: effectiveDashboard ?? null,
        parsedDocuments: props.activeBankProduct.parsedDocuments ?? [],
        messages: [...assistantMessages, { role: 'user', text }],
      });
      appendAssistantMessages([{ role: 'assistant', text: String(response.assistant_text ?? 'Listo.') }]);
    } catch (error) {
      setTxAssistantError(error instanceof Error ? error.message : 'No se pudo responder.');
    } finally {
      setTxAssistantLoading(false);
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
        onClickCapture={() => {
          setShuffleTrigger((n) => n + 1);
          setTransitionPulse((n) => n + 1);
        }}
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
          Conecta cada producto, sube cartolas y revisa el resumen analítico antes de enviar todo al agente.
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
                  onClick={handleCreateProduct}
                  disabled={!canAddMoreProducts}
                >
                  + Agregar producto
                </button>
                <button
                  type="button"
                  className="continue-ghost tx-inject-products-btn"
                  onClick={() => setShowInjectProductsConfirm(true)}
                  disabled={props.documentsLoading || !canInjectToAgent}
                  title={
                    canInjectToAgent
                      ? 'Enviar productos analizados al chat principal'
                      : 'Disponible cuando al menos un producto tenga movimientos detectados'
                  }
                >
                  Inyectar
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
                <p>{props.maxProducts} productos creados por usuario · {props.maxEvidenceFilesPerProduct} archivos por producto · 1 análisis + 3 revisiones de resumen por producto</p>
              </div>
              {showInjectProductsConfirm ? (
                <div className="tx-batch-recommendation-banner" role="status" aria-live="polite">
                  <div className="tx-batch-recommendation-copy">
                    <span className="tx-batch-recommendation-kicker">Inyección consolidada</span>
                    <p>
                      Envía al agente cuando tengas {analyzedProductsCount > 0 ? `${analyzedProductsCount} producto(s) con movimientos` : 'al menos un producto con cartola procesada y movimientos detectados'} para una lectura consolidada.
                    </p>
                  </div>
                  <div className="tx-batch-recommendation-actions">
                    <button
                      type="button"
                      className="continue-ghost tx-batch-action"
                      onClick={() => setShowInjectProductsConfirm(false)}
                      disabled={props.documentsLoading}
                    >
                      Cerrar
                    </button>
                    <button
                      type="button"
                      className="button-primary tx-batch-action"
                      onClick={() => {
                        setShowInjectProductsConfirm(false);
                        props.sendTransactionsToAgent();
                      }}
                      disabled={props.documentsLoading || !canInjectToAgent}
                    >
                      Enviar al agente
                    </button>
                  </div>
                </div>
              ) : null}
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
                    onClick={handleCreateProduct}
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
                          >
                            {preset.title}
                          </button>
                        ))}
                        <button
                          type="button"
                          className="tx-preset-btn tx-preset-btn-add"
                          onClick={handleCreateProduct}
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
                        <button
                          type="button"
                          className="continue-ghost tx-consent-inline-continue"
                          disabled={!canContinueAuto || isDockingToLibrary}
                          onClick={startAuthorizationTransition}
                        >
                          Continuar
                        </button>
                      </div>
                    </div>
                    <div className="agent-modal-actions tx-consent-actions-row">
                      <button type="button" className="continue-ghost tx-delete-product-btn" onClick={() => props.deleteTransactionProduct(props.activeBankProduct!.id)}>Eliminar producto</button>
                      <button
                        type="button"
                        className="continue-ghost tx-consent-continue-main"
                        disabled={!canContinueAuto || isDockingToLibrary}
                        onClick={startAuthorizationTransition}
                      >
                        {isDockingToLibrary ? 'Autorizando…' : 'Conectar y continuar'}
                      </button>
                    </div>
                    </div>
                  </section>
                  )}

                  {activeTxCard === 1 && props.activeBankProduct && (
                    <TxEvidenceStep
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
                      txAssistantError={txAssistantError}
                      pendingManualEvidence={pendingManualEvidence}
                      onPatchUploadFormat={(format) => patchAssistant({ uploadFormat: format })}
                      onResetUploadFormat={() => patchAssistant({ uploadFormat: null })}
                      onSetUploadOnboardingStep={setTxUploadOnboardingStep}
                      onBumpTransitionPulse={() => setTransitionPulse((value) => value + 1)}
                      onAppendPendingEvidence={appendPendingEvidence}
                      onManualEvidenceChange={setManualEvidenceDraft}
                      onAssistantInputChange={setTxAssistantInput}
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
                      onAssistantInputChange={setTxAssistantInput}
                      txAssistantLoading={txAssistantLoading}
                      documentsLoading={props.documentsLoading}
                      isSavedForBatch={isSavedForBatch}
                      onDeleteProduct={() => props.deleteTransactionProduct(props.activeBankProduct!.id)}
                      onGoToEvidence={() => goToTxStage('evidence')}
                      onSaveProductForBatch={() => {
                        props.saveTransactionProductForBatch();
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
