'use client';

import { type ChangeEvent, type KeyboardEvent, type PointerEvent, type Ref } from 'react';
import {
  NumericDust,
  EditorialSummary,
  getFormatLabel,
  renderFormatIcon,
  buildUploadGuidance,
} from './presentation';
import { TxParseProgress } from './TxParseProgress';
import { TxIndicativeNotice } from './TxIndicativeNotice';
import { normalizeUploadFormat } from './tx-assistant.helpers';
import { TxChatMessageBubble, TxChatStarterChips } from './tx-chat-ui';
import { readProductEvidenceFidelity } from '@/lib/evidence-fidelity.helpers';
import { getEvidenceFileAccept } from '@/lib/evidence-format.helpers';
import { shouldSurfaceTxFeedback } from './tx-feedback.helpers';
import type { DocumentsParseProgress } from '@/lib/transactions-parse-progress.helpers';
import type { BankProduct, TxAssistantMessage, TxChatStarterChip, TxUploadFormat } from './types';

const FORMAT_OPTIONS = [
  ['photos', 'Fotos', 'Img'],
  ['pdf', 'PDF', 'Doc'],
  ['spreadsheet', 'Excel / CSV', 'Excel'],
  ['text', 'Texto', 'Txt'],
] as const satisfies ReadonlyArray<readonly [TxUploadFormat, string, string]>;

function SendIcon() {
  return (
    <svg className="tx-composer-send-icon" width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2 8h10M9 4l5 4-5 4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AttachIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M15.5 7.5L9 14a3 3 0 104.24 4.24l7.07-7.07a5 5 0 10-7.07-7.07L5.46 11.9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export interface TxEvidenceStepProps {
  activeBankProduct: BankProduct;
  maxEvidenceFilesPerProduct: number;
  summaryRegenerationsLeft: number;
  transitionPulse: number;
  dockTransitionPhase: string;
  currentStage: string;
  scrollRef: Ref<HTMLDivElement>;
  chatThreadRef?: Ref<HTMLDivElement>;
  assistantMessages: TxAssistantMessage[];
  starterChips?: TxChatStarterChip[];
  highlightedMovementKeys?: string[];
  analysisAlreadyDone: boolean;
  txUploadOnboardingStep: 'format' | 'details' | 'upload';
  selectedUploadFormat: TxUploadFormat | null;
  pendingEvidenceFiles: File[];
  txAssistantInput: string;
  txAssistantLoading: boolean;
  documentsLoading: boolean;
  transactionUploadError?: string | null;
  summaryText: string | null;
  summaryGeneratedAt: string | null;
  summaryModel: string | null;
  processingModeLabel: string;
  processingMetaLabel: string;
  processingPrimaryCopy: string;
  documentsParseProgress?: DocumentsParseProgress | null;
  txAssistantError: string | null;
  txAssistantNotice?: string | null;
  onPatchUploadFormat: (format: TxUploadFormat) => void;
  onResetUploadFormat: () => void;
  onSetUploadOnboardingStep: (step: 'format' | 'details' | 'upload') => void;
  onBumpTransitionPulse: () => void;
  onAppendPendingEvidence: (files: FileList | null) => void | Promise<void>;
  onAssistantInputChange: (value: string) => void;
  onAssistantSend: () => void;
  onAskSuggestedQuestion?: (question: string) => void;
  onRefineSummary: (source: string, body: string) => void;
  onGoToAnalyst: () => void;
  onRegenerateSummary: () => void;
  evidenceResetsLeft?: number;
  onRequestEvidenceReset?: () => void;
  analystContinueLabel?: string;
  analystContinueDisabled?: boolean;
}

export function TxEvidenceStep(props: TxEvidenceStepProps) {
  const p = props;
  const messageCount = p.assistantMessages.length;
  const latestAssistantMessageId = [...p.assistantMessages].reverse().find((message) => message.role === 'assistant')?.id;
  const showStarterShortcuts =
    p.analysisAlreadyDone &&
    (messageCount === 0 || p.assistantMessages[messageCount - 1]?.role === 'user');
  const composerValue = p.txAssistantInput;
  const canAttach = !p.analysisAlreadyDone;
  const hasComposerPayload = Boolean(composerValue.trim()) || p.pendingEvidenceFiles.length > 0;
  const sendDisabled =
    p.txAssistantLoading ||
    p.documentsLoading ||
    !hasComposerPayload ||
    (p.analysisAlreadyDone && p.pendingEvidenceFiles.length > 0);
  const selectedUploadFormat = normalizeUploadFormat(p.selectedUploadFormat);
  const isIndicativeEvidence = readProductEvidenceFidelity(p.activeBankProduct) === 'indicative';
  const expectsIndicativeUpload =
    !p.analysisAlreadyDone && (selectedUploadFormat === 'photos' || selectedUploadFormat === 'text');

  const handleComposerChange = (value: string) => {
    p.onAssistantInputChange(value);
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    if (!sendDisabled) p.onAssistantSend();
  };

  const handleFormatSelect = (value: TxUploadFormat) => {
    p.onPatchUploadFormat(value);
    p.onSetUploadOnboardingStep('details');
    p.onBumpTransitionPulse();
  };

  const handleFormatPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === 'mouse') return;
    event.preventDefault();
  };

  const handleAttachChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    p.onSetUploadOnboardingStep('upload');
    await p.onAppendPendingEvidence(files);
    event.target.value = '';
  };

  const evidenceFileAccept = getEvidenceFileAccept(selectedUploadFormat);

  const showAssistantError = shouldSurfaceTxFeedback({
    message: p.txAssistantError,
    documentsLoading: p.documentsLoading,
    txAssistantLoading: p.txAssistantLoading,
    kind: 'error',
  });
  const showUploadError = shouldSurfaceTxFeedback({
    message: p.transactionUploadError,
    documentsLoading: p.documentsLoading,
    txAssistantLoading: p.txAssistantLoading,
    kind: 'error',
  });
  const showAssistantNotice = shouldSurfaceTxFeedback({
    message: p.txAssistantNotice,
    documentsLoading: p.documentsLoading,
    txAssistantLoading: p.txAssistantLoading,
    kind: 'notice',
  });

  const composerPlaceholder = p.analysisAlreadyDone
    ? 'Pregúntame sobre tus movimientos o pide revisar el resumen'
    : 'Escribe, pega movimientos o adjunta cartolas…';

  return (
    <section className="tx-content-card tx-content-card--agent is-main-center tx-step-reveal">
      <div className="pt-stage-header tx-agent-stage-header tx-agent-stage-header--compact">
        <div className="tx-agent-stage-header-row">
          <div>
            <span className="pt-stage-eyebrow tx-agent-stage-tag">Análisis guiado</span>
            <h4 className="tx-agent-stage-title">Sube tus movimientos</h4>
            <p className="tx-agent-stage-note">
              Adjunta cartola, PDF, Excel o texto. Excel y CSV entregan cifras exactas; fotos y texto libre generan una
              lectura orientativa de patrones y gastos principales.
            </p>
          </div>
          {p.analysisAlreadyDone && p.onRequestEvidenceReset && (p.evidenceResetsLeft ?? 0) > 0 ? (
            <button type="button" className="continue-ghost" onClick={p.onRequestEvidenceReset}>
              Reiniciar evidencia ({p.evidenceResetsLeft})
            </button>
          ) : null}
        </div>
      </div>

      {(isIndicativeEvidence || expectsIndicativeUpload) && (
        <TxIndicativeNotice
          reason={
            isIndicativeEvidence
              ? p.activeBankProduct.dashboard?.evidenceFidelityReason
              : selectedUploadFormat === 'text'
                ? 'Texto suelto o pegado: extraemos señales cualitativas, no un cierre contable.'
                : null
          }
          compact
        />
      )}

      <div
        ref={p.scrollRef}
        className="transactions-summary-card tx-evidence-card tx-evidence-card--premium tx-chat-minimal-body"
      >
        <NumericDust
          scope="chat"
          pulse={p.transitionPulse}
          active={p.dockTransitionPhase === 'chat-reveal' || p.currentStage !== 'consent'}
          count={28}
        />

        <div className="tx-chat-product-context" aria-label="Producto activo del chat">
          <span className="tx-chat-product-context-kicker">Producto activo</span>
          <strong>{p.activeBankProduct.label || p.activeBankProduct.bank || 'Sin nombre'}</strong>
        </div>

        <div ref={p.chatThreadRef} className="tx-chat-thread" aria-live="polite" aria-relevant="additions">
          {messageCount === 0 ? (
            <p className="tx-chat-thread-empty">
              Este chat es solo para <strong>{p.activeBankProduct.label || 'este producto'}</strong>. Cuando autorices y
              envíes antecedentes, la conversación queda guardada al volver.
            </p>
          ) : (
            p.assistantMessages.map((message) => (
              <TxChatMessageBubble
                key={message.id}
                message={message}
                highlightedMovementKeys={p.highlightedMovementKeys}
                followupsDisabled={p.txAssistantLoading || p.documentsLoading}
                onFollowupSelect={p.onAskSuggestedQuestion}
                showFollowups={message.role !== 'assistant' || message.id === latestAssistantMessageId}
              />
            ))
          )}
        </div>

        {!p.analysisAlreadyDone && (
          <div className="tx-format-rail" role="group" aria-label="Formato de evidencia">
            {FORMAT_OPTIONS.map(([value, label, shortLabel]) => (
              <button
                key={value}
                type="button"
                className={`tx-format-rail-chip ${selectedUploadFormat === value ? 'is-active' : ''}`}
                onPointerDown={handleFormatPointerDown}
                onClick={() => handleFormatSelect(value)}
                aria-pressed={selectedUploadFormat === value}
                aria-label={label}
              >
                <span className="tx-format-rail-chip-icon">{renderFormatIcon(value)}</span>
                <span className="tx-format-rail-chip-label">{label}</span>
                <span className="tx-format-rail-chip-label-short" aria-hidden="true">
                  {shortLabel}
                </span>
              </button>
            ))}
          </div>
        )}

        {!p.analysisAlreadyDone && selectedUploadFormat && p.txUploadOnboardingStep !== 'format' && (
          <div className="tx-format-guidance" role="status">
            <div className="tx-format-guidance-copy">
              <span className="tx-format-guidance-kicker">{getFormatLabel(selectedUploadFormat)}</span>
              <p>{buildUploadGuidance(selectedUploadFormat, p.activeBankProduct.productType)}</p>
            </div>
            <button
              type="button"
              className="tx-format-guidance-link"
              onClick={() => {
                p.onResetUploadFormat();
                p.onSetUploadOnboardingStep('format');
              }}
            >
              Cambiar
            </button>
          </div>
        )}

        {(p.pendingEvidenceFiles.length > 0 || p.activeBankProduct.uploadedFiles.length > 0) && (
          <div className="tx-composer-attachments" aria-label="Archivos adjuntos">
            {p.pendingEvidenceFiles.map((file) => (
              <span key={`pending-${file.name}-${file.size}-${file.lastModified}`} className="upload-file-pill" title={file.name}>
                {file.name}
              </span>
            ))}
            {p.activeBankProduct.uploadedFiles.map((name, idx) => (
              <span key={`uploaded-${name}-${idx}`} className="upload-file-pill is-uploaded" title={name}>
                {name}
              </span>
            ))}
            <span className="tx-composer-attachments-count" aria-live="polite">
              {p.pendingEvidenceFiles.length + p.activeBankProduct.uploadedFiles.length}/{p.maxEvidenceFilesPerProduct}
            </span>
          </div>
        )}

        <div className="tx-composer-sticky-host">
          {showStarterShortcuts && p.starterChips && p.starterChips.length > 0 ? (
            <div className="tx-chat-shortcuts">
              <span className="tx-chat-shortcuts-kicker">Atajos analíticos</span>
              <TxChatStarterChips
                chips={p.starterChips}
                disabled={p.txAssistantLoading || p.documentsLoading}
                onSelect={(question) => p.onAskSuggestedQuestion?.(question)}
              />
            </div>
          ) : null}
          <div className="tx-composer-pro" data-analysis-done={p.analysisAlreadyDone ? 'true' : 'false'}>
            {canAttach ? (
              <label className="tx-composer-attach" aria-label="Adjuntar archivos">
                <AttachIcon />
                <input type="file" accept={evidenceFileAccept} multiple onChange={handleAttachChange} />
              </label>
            ) : null}
            <textarea
              className="tx-composer-field"
              value={composerValue}
              onChange={(e) => handleComposerChange(e.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder={composerPlaceholder}
              rows={2}
              aria-label="Mensaje del chat de transacciones"
            />
            <button
              type="button"
              className="tx-composer-send"
              onClick={() => p.onAssistantSend()}
              disabled={sendDisabled}
              aria-label="Enviar mensaje"
              title="Enviar"
            >
              <SendIcon />
            </button>
          </div>

          {!p.analysisAlreadyDone && (
            <p className="tx-composer-hint">
              {selectedUploadFormat
                ? `Solo archivos de ${getFormatLabel(selectedUploadFormat).toLowerCase()} · hasta ${p.maxEvidenceFilesPerProduct} · 50 MB por envío`
                : `Elige un formato arriba o adjunta y lo detectamos automáticamente · hasta ${p.maxEvidenceFilesPerProduct} · 50 MB`}
            </p>
          )}

          {p.analysisAlreadyDone && p.pendingEvidenceFiles.length > 0 && (
            <p className="manual-evidence-hint">
              Este producto ya tiene análisis.
              {(p.evidenceResetsLeft ?? 0) > 0
                ? ' Usa «Reiniciar evidencia» para subir antecedentes nuevos.'
                : ' Ya no quedan reinicios disponibles para este producto.'}
            </p>
          )}
          {showAssistantNotice ? (
            <p className="tx-feedback-notice" role="status">
              {p.txAssistantNotice}
            </p>
          ) : null}
          {showAssistantError ? (
            <p className="tx-feedback-error" role="alert">
              {p.txAssistantError}
            </p>
          ) : null}
          {showUploadError ? (
            <p className="tx-feedback-error" role="alert">
              {p.transactionUploadError}
            </p>
          ) : null}
        </div>
        {(p.documentsLoading || p.txAssistantLoading) && (
          <TxParseProgress
            progress={p.documentsParseProgress}
            fallbackModeLabel={p.processingModeLabel}
            fallbackMetaLabel={p.processingMetaLabel}
            fallbackPrimaryCopy={p.processingPrimaryCopy}
            chatMode={!p.documentsLoading && p.txAssistantLoading}
          />
        )}

        {p.summaryText && (
          <div className="transactions-summary-card tx-doc-intel-grid tx-chat-summary-pro tx-chat-summary-bridge">
            <div className="tx-chat-summary-bridge-head">
              <div>
                <span className="transactions-summary-title">Resumen listo</span>
                <EditorialSummary
                  text={p.summaryText}
                  compact
                  onBlockDoubleClick={({ kicker, body }) =>
                    p.onRefineSummary(kicker ? `hallazgo "${kicker}"` : 'hallazgo del resumen', body)
                  }
                />
              </div>
              <div className="tx-chat-summary-meta">
                <span className="tx-meta-card-kicker">
                  {p.summaryGeneratedAt
                    ? `Actualizado ${new Date(p.summaryGeneratedAt).toLocaleString('es-CL')}`
                    : 'Resumen listo'}
                </span>
                {p.summaryModel ? <span className="tx-meta-card-kicker">Modelo: {p.summaryModel}</span> : null}
                <span className="tx-meta-card-kicker">Revisiones restantes: {p.summaryRegenerationsLeft}</span>
              </div>
            </div>
            <div className="agent-modal-actions tx-flow-inline-actions">
              <button
                type="button"
                className="continue-ghost"
                onClick={() => p.onGoToAnalyst()}
                disabled={p.analystContinueDisabled}
              >
                {p.analystContinueLabel ?? 'Continuar al resumen'}
              </button>
              <button
                type="button"
                className="button-primary"
                disabled={p.txAssistantLoading || p.summaryRegenerationsLeft <= 0}
                onClick={() => p.onRegenerateSummary()}
              >
                {p.summaryRegenerationsLeft > 0 ? 'Revisar resumen' : 'Resumen final'}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
