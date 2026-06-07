'use client';

import { useState, type ChangeEvent, type KeyboardEvent, type Ref } from 'react';
import {
  NumericDust,
  EditorialSummary,
  getFormatLabel,
  renderFormatIcon,
  buildUploadGuidance,
} from './presentation';
import { TxParseProgress } from './TxParseProgress';
import type { DocumentsParseProgress } from '@/lib/transactions-parse-progress.helpers';
import type { BankProduct } from './types';

const EVIDENCE_FILE_ACCEPT =
  'image/*,video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm,.m4v,.avi,.png,.jpg,.jpeg,.webp,.gif,.pdf,.xls,.xlsx,.csv,.txt,.md';

const FORMAT_OPTIONS = [
  ['video', 'Rápido'],
  ['photos', 'Fotos'],
  ['pdf', 'PDF'],
  ['spreadsheet', 'Excel / CSV'],
  ['text', 'Texto'],
] as const;

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
  assistantMessages: Array<{
    id: string;
    role: 'assistant' | 'user';
    text: string;
    attachments?: string[];
  }>;
  analysisAlreadyDone: boolean;
  txUploadOnboardingStep: 'format' | 'details' | 'upload';
  selectedUploadFormat: 'photos' | 'pdf' | 'spreadsheet' | 'text' | 'video' | null;
  pendingEvidenceFiles: File[];
  manualEvidenceDraft: string;
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
  pendingManualEvidence: string;
  onPatchUploadFormat: (format: 'photos' | 'pdf' | 'spreadsheet' | 'text' | 'video') => void;
  onResetUploadFormat: () => void;
  onSetUploadOnboardingStep: (step: 'format' | 'details' | 'upload') => void;
  onBumpTransitionPulse: () => void;
  onAppendPendingEvidence: (files: FileList | null) => void | Promise<void>;
  onManualEvidenceChange: (value: string) => void;
  onAssistantInputChange: (value: string) => void;
  onAssistantSend: () => void;
  onRefineSummary: (source: string, body: string) => void;
  onGoToAnalyst: () => void;
  onRegenerateSummary: () => void;
}

export function TxEvidenceStep(props: TxEvidenceStepProps) {
  const p = props;
  const [showRapidExample, setShowRapidExample] = useState(false);
  const messageCount = p.assistantMessages.length;
  const composerValue = p.txAssistantInput;
  const canAttach = !p.analysisAlreadyDone;
  const hasComposerPayload = Boolean(composerValue.trim()) || p.pendingEvidenceFiles.length > 0;
  const sendDisabled =
    p.txAssistantLoading ||
    p.documentsLoading ||
    !hasComposerPayload ||
    (p.analysisAlreadyDone && p.pendingEvidenceFiles.length > 0);

  const handleComposerChange = (value: string) => {
    p.onAssistantInputChange(value);
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    if (!sendDisabled) p.onAssistantSend();
  };

  const handleFormatSelect = (value: (typeof FORMAT_OPTIONS)[number][0]) => {
    p.onPatchUploadFormat(value);
    p.onSetUploadOnboardingStep('details');
    p.onBumpTransitionPulse();
  };

  const handleAttachChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    const hasVideo = Array.from(files).some(
      (file) => file.type.startsWith('video/') || /\.(mp4|mov|webm|m4v|avi)$/i.test(file.name),
    );
    if (hasVideo) {
      p.onPatchUploadFormat('video');
    } else if (!p.selectedUploadFormat) {
      p.onPatchUploadFormat('photos');
    }
    p.onSetUploadOnboardingStep('upload');
    await p.onAppendPendingEvidence(files);
    event.target.value = '';
  };

  const composerPlaceholder = p.analysisAlreadyDone
    ? 'Pregúntame sobre tus movimientos o pide revisar el resumen'
    : 'Escribe, pega movimientos o adjunta cartolas…';

  return (
    <section className="tx-content-card tx-content-card--agent is-main-center tx-step-reveal">
      <div className="pt-stage-header tx-agent-stage-header">
        <span className="pt-stage-eyebrow tx-agent-stage-tag">Análisis guiado</span>
        <h4 className="tx-agent-stage-title">Sube tus movimientos</h4>
        <p className="tx-agent-stage-note">
          Adjunta cartola, PDF, Excel, texto o una grabación rápida. El agente ordena la evidencia y devuelve una
          lectura ejecutiva clara.
        </p>
      </div>

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

        <div className="tx-evidence-product-bar" aria-label="Producto activo del chat">
          <div className="tx-evidence-product-copy">
            <span className="tx-evidence-product-kicker">Chat exclusivo del producto</span>
            <strong>{p.activeBankProduct.label || 'Producto activo'}</strong>
            <span>{p.activeBankProduct.bank || 'Institución por definir'}</span>
          </div>
          <div className="tx-evidence-product-meta">
            <span>
              {messageCount} mensaje{messageCount === 1 ? '' : 's'}
            </span>
            <span>{p.summaryRegenerationsLeft} revisiones</span>
          </div>
        </div>

        <div ref={p.chatThreadRef} className="tx-chat-thread" aria-live="polite" aria-relevant="additions">
          {messageCount === 0 ? (
            <p className="tx-chat-thread-empty">
              Este chat es solo para <strong>{p.activeBankProduct.label || 'este producto'}</strong>. Cuando autorices y
              envíes antecedentes, la conversación queda guardada al volver.
            </p>
          ) : (
            p.assistantMessages.map((message) => (
              <div
                key={message.id}
                className={`tx-chat-bubble ${message.role === 'user' ? 'is-user' : 'is-assistant'}`}
              >
                <div className="tx-chat-bubble-role">{message.role === 'user' ? 'Tú' : 'Asistente'}</div>
                <div className="tx-chat-bubble-text">{message.text}</div>
                {message.attachments && message.attachments.length > 0 && (
                  <div className="tx-chat-bubble-attachments">
                    {message.attachments.map((attachment) => (
                      <span key={attachment} className="upload-file-pill" title={attachment}>
                        {attachment}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {!p.analysisAlreadyDone && (
          <div className="tx-format-rail" role="group" aria-label="Formato de evidencia">
            {FORMAT_OPTIONS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`tx-format-rail-chip ${p.selectedUploadFormat === value ? 'is-active' : ''}`}
                onClick={() => handleFormatSelect(value)}
                aria-pressed={p.selectedUploadFormat === value}
              >
                <span className="tx-format-rail-chip-icon">{renderFormatIcon(value)}</span>
                <span className="tx-format-rail-chip-label">{label}</span>
              </button>
            ))}
          </div>
        )}

        {!p.analysisAlreadyDone && p.selectedUploadFormat && p.txUploadOnboardingStep !== 'format' && (
          <div className="tx-format-guidance" role="status">
            <div className="tx-format-guidance-copy">
              <span className="tx-format-guidance-kicker">{getFormatLabel(p.selectedUploadFormat)}</span>
              <p>{buildUploadGuidance(p.selectedUploadFormat, p.activeBankProduct.productType)}</p>
              {p.selectedUploadFormat === 'video' && (
                <div className="tx-video-example-actions">
                  <button
                    type="button"
                    className="tx-format-guidance-link"
                    onClick={() => setShowRapidExample((prev) => !prev)}
                  >
                    {showRapidExample ? 'Ocultar ejemplo' : 'Ver ejemplo de grabación'}
                  </button>
                </div>
              )}
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
            {p.selectedUploadFormat === 'video' && showRapidExample && (
              <div className="tx-video-example-shell">
                <video controls playsInline preload="metadata" className="tx-video-example-player">
                  <source src="/generated/transactions-fast-example.mp4" type="video/mp4" />
                  Tu navegador no soporta reproducción de video.
                </video>
              </div>
            )}
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

        <div className="tx-composer-pro" data-analysis-done={p.analysisAlreadyDone ? 'true' : 'false'}>
          {canAttach ? (
            <label className="tx-composer-attach" aria-label="Adjuntar archivos o video">
              <AttachIcon />
              <input type="file" accept={EVIDENCE_FILE_ACCEPT} multiple onChange={handleAttachChange} />
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
            Enter para enviar · Shift+Enter nueva línea · Hasta {p.maxEvidenceFilesPerProduct} archivos · 50 MB por envío
          </p>
        )}

        {p.analysisAlreadyDone && p.pendingEvidenceFiles.length > 0 && (
          <p className="manual-evidence-hint">
            Este producto ya tiene análisis. Para nuevos antecedentes debes recrear el producto.
          </p>
        )}
        {p.txAssistantError && <p className="bcc-hero-error">{p.txAssistantError}</p>}
        {p.transactionUploadError && <p className="bcc-hero-error">{p.transactionUploadError}</p>}
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
              <button type="button" className="continue-ghost" onClick={() => p.onGoToAnalyst()}>
                Ver resumen completo
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
