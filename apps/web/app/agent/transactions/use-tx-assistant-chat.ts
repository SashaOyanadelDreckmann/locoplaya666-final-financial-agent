'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getCsrfToken } from '@/lib/csrf';
import {
  buildChatDashboardForQuestion,
  buildMovementPromptKey,
  buildTransactionStarterChips,
  collectRetrievalSignalsUsed,
  compactDashboardForPrompt,
  planDeterministicTransactionAnswer,
  retrieveMovementsForQuestion,
} from '@/lib/transactions-chat.helpers';
import { buildTransactionChatRequest } from '@/lib/transactions-chat.request';
import {
  buildEvidenceAppendNotice,
  getEvidenceUploadCapacity,
  mergeEvidenceFiles,
  prepareIncomingEvidenceFiles,
} from '@/lib/transactions-evidence.helpers';
import { resolveInstantTransactionSummary } from '@/lib/transactions-summary.helpers';
import { alignProductDashboard } from './align-product-dashboard';
import { buildUploadGuidance } from './presentation';
import { TX_MAX_SINGLE_FILE_BYTES, TX_MAX_TOTAL_FILE_BYTES } from './constants';
import {
  asksForSummaryRegeneration,
  buildManualEvidenceFile,
  inferUploadFormatFromMessage,
  normalizeUploadFormat,
  wantsTextEvidenceUpload,
} from './tx-assistant.helpers';
import { useTxActionSession } from './use-tx-action-session';
import type {
  BankProduct,
  TransactionsModalProps,
  TxAssistantMessage,
  TxChatStarterChip,
  TxUploadOnboardingStep,
  UploadStatementResult,
} from './types';

type EffectiveDashboard = Parameters<typeof compactDashboardForPrompt>[0];

type TransactionChatApiResponse = {
  assistant_text?: string;
  summary?: string;
  suggested_followups?: string[];
  referenced_movement_keys?: string[];
  signals_used?: string[];
  retrieval_mode?: 'targeted' | 'overview';
  matched_count?: number;
  source?: TxAssistantMessage['source'];
  model?: string;
};

function buildAssistantMetaFromResponse(
  question: string,
  dashboard: unknown,
  response?: TransactionChatApiResponse | null,
): Pick<TxAssistantMessage, 'retrievalMeta' | 'suggestedFollowups' | 'referencedMovementKeys' | 'source'> {
  const movements = Array.isArray((dashboard as { movements?: unknown[] } | null)?.movements)
    ? ((dashboard as { movements: unknown[] }).movements ?? [])
    : [];
  const retrieval = retrieveMovementsForQuestion(question, movements as Parameters<typeof retrieveMovementsForQuestion>[1]);
  return {
    retrievalMeta: {
      mode: response?.retrieval_mode ?? retrieval.mode,
      matchedCount: response?.matched_count ?? retrieval.matchedCount,
      signalsUsed:
        Array.isArray(response?.signals_used) && response.signals_used.length > 0
          ? response.signals_used
          : collectRetrievalSignalsUsed(retrieval.signals),
    },
    suggestedFollowups: Array.isArray(response?.suggested_followups)
      ? response.suggested_followups.map((item) => String(item).trim()).filter(Boolean).slice(0, 3)
      : [],
    referencedMovementKeys: Array.isArray(response?.referenced_movement_keys)
      ? response.referenced_movement_keys.map((item) => String(item).trim()).filter(Boolean).slice(0, 12)
      : retrieval.movements.map((row) => buildMovementPromptKey(row)),
    source: response?.source ?? 'llm',
  };
}

export function useTxAssistantChat(params: {
  isOpen: boolean;
  txWizardStep: TransactionsModalProps['txWizardStep'];
  selectedProductId: string | null;
  activeBankProduct: BankProduct | null;
  activeProductId: string | null;
  analysisAlreadyDone: boolean;
  maxEvidenceFilesPerProduct: number;
  effectiveDashboard: EffectiveDashboard;
  documentsLoading: boolean;
  updateProductById: TransactionsModalProps['updateProductById'];
  updateActiveProduct: TransactionsModalProps['updateActiveProduct'];
  onUploadStatement: TransactionsModalProps['onUploadStatement'];
  onDocumentsParseProgress?: TransactionsModalProps['onDocumentsParseProgress'];
  setTxWizardStep: TransactionsModalProps['setTxWizardStep'];
}) {
  const {
    isOpen,
    txWizardStep,
    selectedProductId,
    activeBankProduct,
    activeProductId,
    analysisAlreadyDone,
    maxEvidenceFilesPerProduct,
    effectiveDashboard,
    documentsLoading,
    updateProductById,
    updateActiveProduct,
    onUploadStatement,
    onDocumentsParseProgress,
    setTxWizardStep,
  } = params;

  const [pendingEvidenceFilesByProduct, setPendingEvidenceFilesByProduct] = useState<Record<string, File[]>>({});
  const [txAssistantInputByProduct, setTxAssistantInputByProduct] = useState<Record<string, string>>({});
  const [txAssistantLoadingByProduct, setTxAssistantLoadingByProduct] = useState<Record<string, boolean>>({});
  const [txAssistantErrorByProduct, setTxAssistantErrorByProduct] = useState<Record<string, string | null>>({});
  const [txUploadOnboardingStepByProduct, setTxUploadOnboardingStepByProduct] = useState<
    Record<string, TxUploadOnboardingStep>
  >({});
  const [highlightedMovementKeysByProduct, setHighlightedMovementKeysByProduct] = useState<
    Record<string, string[]>
  >({});

  const { txSendLockRef, invalidateTxSession, beginTxAction, isTxActionStale } = useTxActionSession(
    isOpen,
    selectedProductId,
  );

  const pendingEvidenceFiles = activeProductId ? pendingEvidenceFilesByProduct[activeProductId] ?? [] : [];
  const txAssistantInput = activeProductId ? txAssistantInputByProduct[activeProductId] ?? '' : '';
  const txAssistantLoading = activeProductId ? Boolean(txAssistantLoadingByProduct[activeProductId]) : false;
  const txAssistantError = activeProductId ? txAssistantErrorByProduct[activeProductId] ?? null : null;
  const txUploadOnboardingStep: TxUploadOnboardingStep = activeProductId
    ? txUploadOnboardingStepByProduct[activeProductId] ?? 'format'
    : 'format';

  const assistantMessages = activeBankProduct?.assistant?.messages ?? [];
  const highlightedMovementKeys = activeProductId
    ? highlightedMovementKeysByProduct[activeProductId] ?? []
    : [];
  const starterChips: TxChatStarterChip[] = useMemo(() => {
    if (!analysisAlreadyDone || !effectiveDashboard) return [];
    return buildTransactionStarterChips(effectiveDashboard, 6);
  }, [analysisAlreadyDone, effectiveDashboard]);
  const summaryText = activeBankProduct?.assistant?.summaryText ?? null;
  const summaryGeneratedAt = activeBankProduct?.assistant?.summaryGeneratedAt ?? null;
  const summaryModel = activeBankProduct?.assistant?.summaryModel ?? null;
  const summaryRegenerationsUsed = Math.max(0, activeBankProduct?.assistant?.summaryRegenerationsUsed ?? 0);
  const summaryRegenerationsLeft = Math.max(0, 3 - summaryRegenerationsUsed);
  const selectedUploadFormat = normalizeUploadFormat(activeBankProduct?.assistant?.uploadFormat);
  const hasSummary = Boolean(summaryText?.trim());

  const setActivePendingEvidenceFiles = useCallback(
    (updater: File[] | ((current: File[]) => File[])) => {
      if (!activeProductId) return;
      setPendingEvidenceFilesByProduct((prev) => {
        const current = prev[activeProductId] ?? [];
        const next = typeof updater === 'function' ? updater(current) : updater;
        return { ...prev, [activeProductId]: next };
      });
    },
    [activeProductId],
  );

  const setActiveTxAssistantInput = useCallback(
    (value: string) => {
      if (!activeProductId) return;
      setTxAssistantInputByProduct((prev) => ({ ...prev, [activeProductId]: value }));
    },
    [activeProductId],
  );

  const setActiveUploadOnboardingStep = useCallback(
    (step: TxUploadOnboardingStep) => {
      if (!activeProductId) return;
      setTxUploadOnboardingStepByProduct((prev) => ({ ...prev, [activeProductId]: step }));
    },
    [activeProductId],
  );

  const setProductLoading = useCallback((productId: string, value: boolean) => {
    setTxAssistantLoadingByProduct((prev) => ({ ...prev, [productId]: value }));
  }, []);

  const setProductError = useCallback((productId: string, value: string | null) => {
    setTxAssistantErrorByProduct((prev) => ({ ...prev, [productId]: value }));
  }, []);

  const clearProductDraft = useCallback((productId: string) => {
    setPendingEvidenceFilesByProduct((prev) => ({ ...prev, [productId]: [] }));
    setTxAssistantInputByProduct((prev) => ({ ...prev, [productId]: '' }));
    setTxAssistantErrorByProduct((prev) => ({ ...prev, [productId]: null }));
  }, []);

  const clearPendingEvidence = useCallback(() => {
    if (!activeProductId) return;
    clearProductDraft(activeProductId);
  }, [activeProductId, clearProductDraft]);

  const setHighlightedMovementKeys = useCallback(
    (productId: string, keys: string[]) => {
      setHighlightedMovementKeysByProduct((prev) => ({ ...prev, [productId]: keys }));
    },
    [],
  );

  const restoreAssistantMessages = useCallback(
    (
      productId: string,
      productSnapshot: BankProduct,
      messages: TxAssistantMessage[],
    ) => {
      updateProductById(productId, {
        assistant: {
          messages,
          uploadFormat: productSnapshot.assistant?.uploadFormat ?? null,
          summaryText: productSnapshot.assistant?.summaryText ?? null,
          summaryModel: productSnapshot.assistant?.summaryModel ?? null,
          summaryGeneratedAt: productSnapshot.assistant?.summaryGeneratedAt ?? null,
          summaryRegenerationsUsed: productSnapshot.assistant?.summaryRegenerationsUsed ?? 0,
          lastSummaryFeedback: productSnapshot.assistant?.lastSummaryFeedback ?? null,
        },
      });
    },
    [updateProductById],
  );

  const appendAssistantMessages = useCallback(
    (
      productId: string,
      productSnapshot: BankProduct,
      nextMessages: Array<
        Pick<TxAssistantMessage, 'role' | 'text' | 'attachments' | 'retrievalMeta' | 'suggestedFollowups' | 'referencedMovementKeys' | 'source'>
      >,
      extraPatch?: Partial<NonNullable<BankProduct['assistant']>>,
    ) => {
      if (nextMessages.length === 0) return;
      const baseMessages = productSnapshot.assistant?.messages ?? [];
      updateProductById(productId, {
        assistant: {
          messages: [
            ...baseMessages,
            ...nextMessages.map((message, index) => ({
              id: `${Date.now()}-${index}-${message.role}`,
              role: message.role,
              text: message.text,
              createdAt: new Date().toISOString(),
              attachments: message.attachments,
              retrievalMeta: message.retrievalMeta,
              suggestedFollowups: message.suggestedFollowups,
              referencedMovementKeys: message.referencedMovementKeys,
              source: message.source,
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
    },
    [updateProductById],
  );

  const patchAssistant = useCallback(
    (extraPatch: Partial<NonNullable<BankProduct['assistant']>>) => {
      if (!activeBankProduct) return;
      updateActiveProduct({
        assistant: {
          messages: activeBankProduct.assistant?.messages ?? [],
          uploadFormat: activeBankProduct.assistant?.uploadFormat ?? null,
          summaryText: activeBankProduct.assistant?.summaryText ?? null,
          summaryModel: activeBankProduct.assistant?.summaryModel ?? null,
          summaryGeneratedAt: activeBankProduct.assistant?.summaryGeneratedAt ?? null,
          summaryRegenerationsUsed: activeBankProduct.assistant?.summaryRegenerationsUsed ?? 0,
          lastSummaryFeedback: activeBankProduct.assistant?.lastSummaryFeedback ?? null,
          ...extraPatch,
        },
      });
    },
    [activeBankProduct, updateActiveProduct],
  );

  const maybeInitAssistant = useCallback(() => {
    const product = activeBankProduct;
    if (!product?.connected) return;
    if ((product.assistant?.messages ?? []).length > 0) return;
    appendAssistantMessages(product.id, product, [
      {
        role: 'assistant',
        text: 'Antes de subir movimientos, dime cómo prefieres enviarlos: rápido, fotos, PDF, Excel/CSV o texto. Según eso te recomiendo la mejor forma para que el análisis salga limpio.',
      },
    ]);
  }, [activeBankProduct, appendAssistantMessages]);

  const requestTransactionAssistant = useCallback(async (payload: Record<string, unknown>, signal?: AbortSignal) => {
    const res = await fetch('/api/transactions-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken() || '' },
      credentials: 'include',
      signal,
      body: JSON.stringify(payload),
    });
    const data = (await res.json().catch(() => null)) as TransactionChatApiResponse & { ok?: boolean; error?: string };
    if (!res.ok || !data?.ok) throw new Error(data?.error || 'No se pudo responder');
    return data;
  }, []);

  const applyInstantTransactionSummary = useCallback(
    async (options?: {
      uploadResult?: UploadStatementResult | null;
      feedback?: string;
      isRegeneration?: boolean;
      productId?: string;
      productSnapshot?: BankProduct;
    }) => {
      const product = options?.productSnapshot ?? activeBankProduct;
      if (!product) return false;
      const productId = options?.productId ?? product.id;
      const priorRegenerations = product.assistant?.summaryRegenerationsUsed ?? 0;
      onDocumentsParseProgress?.({
        stage: 'summarizing',
        percent: 94,
        detail: 'Preparando resumen ejecutivo instantáneo.',
      });
      const uploadResult = options?.uploadResult ?? null;
      const rawDashboard = uploadResult?.dashboard ?? product.dashboard ?? null;
      const dashboard =
        alignProductDashboard(
          {
            dashboard: rawDashboard ?? undefined,
            productType: uploadResult?.product.productType ?? product.productType,
          },
          [],
        ) ?? rawDashboard;
      const instantSummary = resolveInstantTransactionSummary(dashboard);
      if (!instantSummary) return false;

      updateProductById(productId, {
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
      if (!options?.isRegeneration && productId === selectedProductId) {
        setTxWizardStep('dashboard');
      }
      onDocumentsParseProgress?.({
        stage: 'complete',
        percent: 100,
        detail: 'Análisis listo.',
      });
      window.setTimeout(() => {
        onDocumentsParseProgress?.({
          stage: 'idle',
          percent: 0,
          detail: '',
        });
      }, 1400);
      return true;
    },
    [activeBankProduct, onDocumentsParseProgress, selectedProductId, setTxWizardStep, updateProductById],
  );

  const generateTransactionSummary = useCallback(
    async (options?: {
      feedback?: string;
      uploadResult?: UploadStatementResult | null;
      isRegeneration?: boolean;
      productId?: string;
      productSnapshot?: BankProduct;
    }) => {
      const product = options?.productSnapshot ?? activeBankProduct;
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
      onDocumentsParseProgress?.({
        stage: 'summarizing',
        percent: 92,
        detail: 'Regenerando resumen con el modelo analítico.',
      });
      const txAction = beginTxAction();
      const { sessionId, controller, finish } = txAction;
      try {
        const uploadResult = options?.uploadResult ?? null;
        const response = await requestTransactionAssistant(
          {
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
          },
          controller.signal,
        );
        if (isTxActionStale(sessionId, productId)) return;
        updateProductById(productId, {
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
        if (!options?.isRegeneration && productId === selectedProductId) {
          setTxWizardStep('dashboard');
        }
        onDocumentsParseProgress?.({
          stage: 'complete',
          percent: 100,
          detail: 'Resumen actualizado.',
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (isTxActionStale(sessionId, productId)) return;
        setProductError(productId, error instanceof Error ? error.message : 'No se pudo generar el resumen.');
      } finally {
        finish();
        if (!isTxActionStale(sessionId, productId)) {
          setProductLoading(productId, false);
        }
      }
    },
    [
      activeBankProduct,
      applyInstantTransactionSummary,
      beginTxAction,
      effectiveDashboard,
      isTxActionStale,
      onDocumentsParseProgress,
      requestTransactionAssistant,
      selectedProductId,
      setProductError,
      setProductLoading,
      setTxWizardStep,
      updateProductById,
    ],
  );

  const handleAssistantUploadSend = useCallback(
    async (messageText: string, options?: { includeTextAsEvidence?: boolean }) => {
      const product = activeBankProduct;
      if (!product) return;
      const productId = product.id;
      const manualText = options?.includeTextAsEvidence ? messageText.trim() : '';
      const manualFile = manualText.length > 0 ? buildManualEvidenceFile(manualText) : null;
      const filesToUpload = manualFile ? [...pendingEvidenceFiles, manualFile] : pendingEvidenceFiles;
      if (filesToUpload.length === 0) return;
      const previousMessages = product.assistant?.messages ?? [];

      setProductLoading(productId, true);
      setProductError(productId, null);
      const txAction = beginTxAction();
      const { sessionId, finish } = txAction;
      try {
        appendAssistantMessages(productId, product, [
          {
            role: 'user',
            text: messageText || 'Te envío antecedentes de transacciones.',
            attachments: filesToUpload.map((file) => file.name),
          },
        ]);
        const result = await onUploadStatement(filesToUpload);
        if (isTxActionStale(sessionId, productId)) return;
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
        if (isTxActionStale(sessionId, productId)) return;
        restoreAssistantMessages(productId, product, previousMessages);
        setProductError(productId, error instanceof Error ? error.message : 'No se pudo enviar evidencia.');
      } finally {
        finish();
        if (!isTxActionStale(sessionId, productId)) {
          setProductLoading(productId, false);
        }
      }
    },
    [
      activeBankProduct,
      appendAssistantMessages,
      beginTxAction,
      clearProductDraft,
      generateTransactionSummary,
      isTxActionStale,
      onUploadStatement,
      pendingEvidenceFiles,
      restoreAssistantMessages,
      setProductError,
      setProductLoading,
    ],
  );

  const submitAssistantQuestion = useCallback(
    async (rawText: string, options?: { preserveComposer?: boolean }) => {
      if (!activeBankProduct || txAssistantLoading || txSendLockRef.current) return;
      const product = activeBankProduct;
      const productId = product.id;
      const productSummaryText = product.assistant?.summaryText ?? null;
      const productRegenerationsUsed = product.assistant?.summaryRegenerationsUsed ?? 0;
      const productRegenerationsLeft = Math.max(0, 3 - productRegenerationsUsed);
      const productMessages = product.assistant?.messages ?? [];
      const text = rawText.trim();
      const hasAttachedFiles = pendingEvidenceFiles.length > 0;
      const shouldUploadTextEvidence = wantsTextEvidenceUpload({
        analysisAlreadyDone,
        uploadFormat: product.assistant?.uploadFormat,
        text,
        hasAttachedFiles,
      });
      if (!text && !hasAttachedFiles) return;

      if (!options?.preserveComposer) {
        setTxAssistantInputByProduct((prev) => ({ ...prev, [productId]: '' }));
      }

      txSendLockRef.current = true;
      const txAction = beginTxAction();
      const { sessionId, controller, finish } = txAction;
      const previousMessages = productMessages;
      try {
        if (hasAttachedFiles || shouldUploadTextEvidence) {
          await handleAssistantUploadSend(text, { includeTextAsEvidence: shouldUploadTextEvidence });
          return;
        }

        appendAssistantMessages(productId, product, [{ role: 'user', text }]);
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

        const chosenFormat = inferUploadFormatFromMessage(text);
        if (chosenFormat) {
          appendAssistantMessages(
            productId,
            withUserMessage,
            [{ role: 'assistant', text: buildUploadGuidance(chosenFormat, product.productType) }],
            { uploadFormat: chosenFormat },
          );
          return;
        }

        if (asksForSummaryRegeneration(text, Boolean(productSummaryText)) && productRegenerationsLeft > 0) {
          await generateTransactionSummary({
            feedback: text,
            isRegeneration: true,
            productId,
            productSnapshot: withUserMessage,
          });
          return;
        }

        if (analysisAlreadyDone) {
          const deterministic = planDeterministicTransactionAnswer(text, effectiveDashboard);
          if (deterministic) {
            const movements = Array.isArray((effectiveDashboard as { movements?: unknown[] } | null)?.movements)
              ? ((effectiveDashboard as { movements: unknown[] }).movements ?? [])
              : [];
            const retrieval = retrieveMovementsForQuestion(
              text,
              movements as Parameters<typeof retrieveMovementsForQuestion>[1],
            );
            appendAssistantMessages(productId, withUserMessage, [
              {
                role: 'assistant',
                text: deterministic.reply,
                retrievalMeta: {
                  mode: retrieval.mode,
                  matchedCount: retrieval.matchedCount,
                  signalsUsed: collectRetrievalSignalsUsed(retrieval.signals),
                },
                suggestedFollowups: deterministic.suggestedFollowups,
                referencedMovementKeys: deterministic.referencedMovementKeys,
                source: 'client-deterministic',
              },
            ]);
            setHighlightedMovementKeys(productId, deterministic.referencedMovementKeys);
            return;
          }
        }

        setProductLoading(productId, true);
        setProductError(productId, null);
        const response = await requestTransactionAssistant(
          buildTransactionChatRequest(product, {
            mode: 'chat',
            question: text,
            currentSummary: productSummaryText,
            dashboard:
              buildChatDashboardForQuestion(effectiveDashboard, text) ??
              compactDashboardForPrompt(effectiveDashboard, { maxMovements: 24, maxMerchants: 8 }),
            messages: [...productMessages, { role: 'user', text }],
          }),
          controller.signal,
        );
        if (isTxActionStale(sessionId, productId)) return;
        const meta = buildAssistantMetaFromResponse(text, effectiveDashboard, response);
        appendAssistantMessages(productId, withUserMessage, [
          {
            role: 'assistant',
            text: String(response.assistant_text ?? 'Listo.'),
            ...meta,
          },
        ]);
        setHighlightedMovementKeys(productId, meta.referencedMovementKeys ?? []);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (isTxActionStale(sessionId, productId)) return;
        restoreAssistantMessages(productId, product, previousMessages);
        setProductError(productId, error instanceof Error ? error.message : 'No se pudo responder.');
      } finally {
        finish();
        if (!isTxActionStale(sessionId, productId)) {
          setProductLoading(productId, false);
        }
        txSendLockRef.current = false;
      }
    },
    [
      activeBankProduct,
      analysisAlreadyDone,
      appendAssistantMessages,
      beginTxAction,
      effectiveDashboard,
      generateTransactionSummary,
      handleAssistantUploadSend,
      isTxActionStale,
      pendingEvidenceFiles.length,
      requestTransactionAssistant,
      restoreAssistantMessages,
      setHighlightedMovementKeys,
      setProductError,
      setProductLoading,
      txAssistantLoading,
      txSendLockRef,
    ],
  );

  const handleAssistantTextSend = useCallback(async () => {
    if (!activeBankProduct || txAssistantLoading || txSendLockRef.current) return;
    const text = txAssistantInput.trim();
    if (!text && pendingEvidenceFiles.length === 0) return;
    await submitAssistantQuestion(text);
  }, [activeBankProduct, pendingEvidenceFiles.length, submitAssistantQuestion, txAssistantInput, txAssistantLoading, txSendLockRef]);

  const refineTransactionSummaryFromFocus = useCallback(
    async (source: string, focusText: string) => {
      if (!activeBankProduct || !summaryText || summaryRegenerationsLeft <= 0 || txAssistantLoading) return;
      const clippedFocus = focusText.trim().replace(/\s+/g, ' ').slice(0, 320);
      if (!clippedFocus) return;
      await generateTransactionSummary({
        feedback: `Reanaliza con foco en ${source}: "${clippedFocus}". Verifica cálculo, categorización de comercios chilenos y consistencia global del resumen. Corrige el resumen final si detectas desvíos.`,
        isRegeneration: true,
      });
    },
    [activeBankProduct, generateTransactionSummary, summaryRegenerationsLeft, summaryText, txAssistantLoading],
  );

  const appendPendingEvidence = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      if (!activeProductId) return;
      if (analysisAlreadyDone) {
        setProductError(
          activeProductId,
          'Este producto ya fue analizado. Para nuevos antecedentes debes recrear el producto.',
        );
        return;
      }
      const capacity = getEvidenceUploadCapacity(
        maxEvidenceFilesPerProduct,
        activeBankProduct?.uploadedFiles.length ?? 0,
      );
      if (capacity <= 0) {
        setProductError(
          activeProductId,
          `Este producto ya alcanzó el límite de ${maxEvidenceFilesPerProduct} archivos.`,
        );
        return;
      }
      const optimized = await prepareIncomingEvidenceFiles(files);
      const mergeResult = mergeEvidenceFiles(pendingEvidenceFiles, optimized, {
        capacity,
        maxSingleBytes: TX_MAX_SINGLE_FILE_BYTES,
        maxTotalBytes: TX_MAX_TOTAL_FILE_BYTES,
      });

      setActivePendingEvidenceFiles(mergeResult.files);
      setProductError(
        activeProductId,
        buildEvidenceAppendNotice(mergeResult, {
          maxFilesPerProduct: maxEvidenceFilesPerProduct,
          maxSingleBytes: TX_MAX_SINGLE_FILE_BYTES,
          maxTotalBytes: TX_MAX_TOTAL_FILE_BYTES,
        }),
      );
    },
    [
      activeBankProduct?.uploadedFiles.length,
      activeProductId,
      analysisAlreadyDone,
      maxEvidenceFilesPerProduct,
      pendingEvidenceFiles,
      setActivePendingEvidenceFiles,
      setProductError,
    ],
  );

  useEffect(() => {
    if (isOpen) return;
    if (!activeProductId) return;
    setProductLoading(activeProductId, false);
    setProductError(activeProductId, null);
    txSendLockRef.current = false;
  }, [activeProductId, isOpen, setProductError, setProductLoading, txSendLockRef]);

  useEffect(() => {
    if (!isOpen || txWizardStep !== 'upload' || !activeProductId) return;
    setTxUploadOnboardingStepByProduct((prev) => {
      const current = prev[activeProductId];
      const nextStep: TxUploadOnboardingStep = analysisAlreadyDone
        ? 'upload'
        : selectedUploadFormat
          ? 'details'
          : 'upload';
      if (current === nextStep) return prev;
      return { ...prev, [activeProductId]: nextStep };
    });
  }, [activeProductId, analysisAlreadyDone, isOpen, selectedUploadFormat, txWizardStep]);

  return {
    invalidateTxSession,
    pendingEvidenceFiles,
    txAssistantInput,
    txAssistantLoading,
    txAssistantError,
    txUploadOnboardingStep,
    assistantMessages,
    starterChips,
    highlightedMovementKeys,
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
    submitAssistantQuestion,
    refineTransactionSummaryFromFocus,
    generateTransactionSummary,
    processingModeLabel: documentsLoading ? 'Procesando evidencia' : 'Pensando respuesta',
    processingMetaLabel: documentsLoading ? 'OCR, normalización y conciliación' : 'Contexto, consistencia y respuesta',
    processingPrimaryCopy: documentsLoading
      ? 'Leyendo archivos, detectando montos y consolidando movimientos.'
      : 'Revisando contexto del producto para responder mejor.',
  };
}
