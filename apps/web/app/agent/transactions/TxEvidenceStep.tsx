'use client';

import { useState, type ChangeEvent, type Ref } from 'react';
import {
  NumericDust,
  EditorialSummary,
  getFormatLabel,
  getFormatMicrocopy,
  renderFormatIcon,
  buildUploadGuidance,
} from './presentation';
import { TxParseProgress } from './TxParseProgress';
import type { DocumentsParseProgress } from '@/lib/transactions-parse-progress.helpers';
import type { BankProduct } from './types';

export interface TxEvidenceStepProps {
  activeBankProduct: BankProduct;
  maxEvidenceFilesPerProduct: number;
  summaryRegenerationsLeft: number;
  transitionPulse: number;
  dockTransitionPhase: string;
  currentStage: string;
  scrollRef: Ref<HTMLDivElement>;
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
  onAppendPendingEvidence: (files: FileList | null) => void;
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
  return (
                  <section className="tx-content-card tx-content-card--agent is-main-center tx-step-reveal">
                    <div className="pt-stage-header tx-agent-stage-header">
                      <span
                        className="pt-stage-eyebrow tx-agent-stage-tag"
                        style={{
                          color: 'rgba(84, 145, 214, 0.88)',
                          fontSize: '10px',
                          fontWeight: 700,
                          letterSpacing: '0.16em',
                          textTransform: 'uppercase',
                        }}
                      >
                        Análisis guiado
                      </span>
                      <h4
                        className="tx-agent-stage-title"
                        style={{
                          fontFamily: 'Georgia, "Times New Roman", serif',
                          fontSize: 'clamp(46px, 5.1vw, 82px)',
                          fontWeight: 400,
                          letterSpacing: '-0.045em',
                          lineHeight: 0.96,
                          color: '#f0f0f5',
                          margin: 0,
                          maxWidth: '12ch',
                          textWrap: 'balance',
                          textShadow: '0 20px 70px rgba(0, 0, 0, 0.46)',
                        }}
                      >
                        Sube tus movimientos
                      </h4>
                      <p
                        className="tx-agent-stage-note"
                        style={{
                          maxWidth: '460px',
                          fontSize: 'clamp(12px, 0.92vw, 14px)',
                          lineHeight: 1.4,
                          color: 'rgba(238, 242, 247, 0.46)',
                          marginTop: '2px',
                          letterSpacing: '0.005em',
                        }}
                      >
                        Adjunta cartola, PDF, Excel, texto o una grabación rápida de pantalla. El agente ordena la evidencia y devuelve una lectura ejecutiva clara.
                      </p>
                    </div>
                    <div ref={p.scrollRef} className="transactions-summary-card tx-evidence-card tx-evidence-card--premium tx-chat-minimal-body">
                      <NumericDust scope="chat" pulse={p.transitionPulse} active={p.dockTransitionPhase === 'chat-reveal' || p.currentStage !== 'consent'} count={28} />
                      <div className="tx-editorial-intro tx-editorial-intro--agent">
                        <span className="transactions-summary-title">Mesa de evidencia</span>
                        <div className="tx-editorial-meta-row">
                          <span>Hasta {p.maxEvidenceFilesPerProduct} respaldos</span>
                          <span>{p.summaryRegenerationsLeft} iteraciones</span>
                        </div>
                      </div>

                      {p.assistantMessages.length > 0 && (
                      <div className="tx-chat-thread">
                        {p.assistantMessages.map((message) => (
                          <div
                            key={message.id}
                            className={`tx-chat-bubble ${message.role === 'user' ? 'is-user' : 'is-assistant'}`}
                          >
                            <div className="tx-chat-bubble-role">
                              {message.role === 'user' ? 'Tú' : 'Asistente'}
                            </div>
                            <div className="tx-chat-bubble-text">{message.text}</div>
                            {message.attachments && message.attachments.length > 0 && (
                              <div className="tx-chat-bubble-attachments">
                                {message.attachments.map((attachment) => (
                                  <span key={attachment} className="upload-file-pill">{attachment}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      )}

                      {!p.analysisAlreadyDone && (
                        <div className="tx-upload-onboarding tx-upload-onboarding--agent tx-upload-onboarding--bare">
                          {p.txUploadOnboardingStep === 'format' && (
                            <div className="tx-onboarding-card tx-onboarding-card--compact tx-onboarding-card--bare">
                              <div className="tx-onboarding-card-head tx-onboarding-card-head--stack">
                                <span className="tx-onboarding-kicker">Formato</span>
                                <div className="tx-onboarding-copy">Selecciona la fuente.</div>
                              </div>
                              <div className="tx-chat-format-pills tx-chat-format-pills--premium tx-chat-format-pills--deck">
                                {([
                                  ['video', 'Rápido'],
                                  ['photos', 'Fotos'],
                                  ['pdf', 'PDF'],
                                  ['spreadsheet', 'Excel / CSV'],
                                  ['text', 'Texto'],
                                ] as const).map(([value, label]) => (
                                  <button
                                    key={value}
                                    type="button"
                                    className={`continue-ghost tx-format-choice ${p.selectedUploadFormat === value ? 'is-active' : ''}`}
                                    onClick={() => {
                                      p.onPatchUploadFormat(value);
                                      p.onSetUploadOnboardingStep('details');
                                    }}
                                  >
                                    <span className="tx-format-choice-icon">{renderFormatIcon(value)}</span>
                                    <span className="tx-format-choice-main">{label}</span>
                                    <span className="tx-format-choice-sub">{getFormatMicrocopy(value)}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {p.txUploadOnboardingStep === 'details' && p.selectedUploadFormat && (
                            <div className="tx-onboarding-card tx-onboarding-card--guidance tx-onboarding-card--compact tx-onboarding-card--bare">
                              <div className="tx-onboarding-card-head">
                                <div className="tx-onboarding-card-head tx-onboarding-card-head--stack">
                                  <span className="tx-onboarding-kicker">Detalle</span>
                                  <div className="tx-onboarding-detail-chip">{getFormatLabel(p.selectedUploadFormat)}</div>
                                </div>
                                <button
                                  type="button"
                                  className="tx-onboarding-reset"
                                  onClick={() => {
                                    p.onResetUploadFormat();
                                    p.onSetUploadOnboardingStep('format');
                                  }}
                                >
                                  Cambiar
                                </button>
                              </div>
                              <div className="tx-onboarding-copy">
                                {buildUploadGuidance(p.selectedUploadFormat, p.activeBankProduct!.productType)}
                                {p.selectedUploadFormat === 'video' && (
                                  <div className="mt-4 flex flex-wrap items-center gap-3">
                                    <button
                                      type="button"
                                      className="tx-onboarding-reset"
                                      onClick={() => setShowRapidExample((prev) => !prev)}
                                    >
                                      {showRapidExample ? 'Ocultar ejemplo' : 'Ver ejemplo'}
                                    </button>
                                    <span className="text-[11px] uppercase tracking-[0.18em] text-white/35">
                                      Grabación real
                                    </span>
                                  </div>
                                )}
                              </div>
                              {p.selectedUploadFormat === 'video' && showRapidExample && (
                                <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                                  <video
                                    controls
                                    playsInline
                                    preload="metadata"
                                    className="w-full max-h-[420px] bg-black"
                                  >
                                    <source src="/generated/transactions-fast-example.mp4" type="video/mp4" />
                                    Tu navegador no soporta reproducción de video.
                                  </video>
                                </div>
                              )}
                              <button
                                type="button"
                                className="tx-onboarding-next tx-onboarding-next--edge"
                                onClick={() => {
                                  p.onBumpTransitionPulse();
                                  p.onSetUploadOnboardingStep('upload');
                                }}
                                aria-label="Continuar a carga"
                              >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                  <path d="M8 5l8 7-8 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {(p.analysisAlreadyDone || p.txUploadOnboardingStep === 'upload') && (
                      <div className="upload-zone tx-upload-zone-premium tx-upload-zone-premium--rail tx-upload-zone-premium--inline">
                        <div className="tx-upload-actions">
                          <button
                            type="button"
                            className="tx-upload-video-btn"
                            onClick={() => {
                              p.onPatchUploadFormat('video');
                              p.onSetUploadOnboardingStep('upload');
                            }}
                          >
                            Subir video
                          </button>
                        </div>
                        <label className="upload-label upload-label--minimal">
                          <span>Adjuntar</span>
                          <span className="upload-trigger-minimal" aria-hidden="true">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                              <path d="M15.5 7.5L9 14a3 3 0 104.24 4.24l7.07-7.07a5 5 0 10-7.07-7.07L5.46 11.9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </span>
                          <input
                            type="file"
                            accept="image/*,video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm,.m4v,.avi,.png,.jpg,.jpeg,.webp,.gif,.pdf,.xls,.xlsx,.csv,.txt,.md"
                            multiple
                            onChange={(e: ChangeEvent<HTMLInputElement>) => p.onAppendPendingEvidence(e.target.files)}
                          />
                        </label>
                        <label className="manual-evidence-block">
                          <span className="manual-evidence-label">Nota opcional</span>
                          <textarea
                            className="manual-evidence-textarea"
                            value={p.manualEvidenceDraft}
                            onChange={(e) => p.onManualEvidenceChange(e.target.value)}
                            placeholder="Contexto adicional."
                            rows={2}
                          />
                        </label>
                        {p.pendingEvidenceFiles.length > 0 && (
                          <div className="transactions-product-insights">
                            {p.pendingEvidenceFiles.slice(0, 12).map((file) => (
                              <span key={`${file.name}-${file.size}`}>{file.name}</span>
                            ))}
                          </div>
                        )}
                        <div className="upload-files">
                          {p.activeBankProduct.uploadedFiles.length === 0 && <span>Aún no hay archivos cargados.</span>}
                          {p.activeBankProduct.uploadedFiles.map((name, idx) => <span key={`${name}-${idx}`} className="upload-file-pill">{name}</span>)}
                        </div>
                      </div>
                      )}

                      {(p.analysisAlreadyDone || p.txUploadOnboardingStep === 'upload') && (
                      <div className="bcc-hero-input-wrap tx-chat-composer-wrap tx-chat-composer-wrap--premium">
                        <input
                          className="bcc-hero-input"
                          value={p.txAssistantInput}
                          onChange={(e) => p.onAssistantInputChange(e.target.value)}
                          placeholder={p.analysisAlreadyDone ? 'Pregúntame sobre tus movimientos o pide revisar el resumen' : 'Escribe o adjunta archivos para enviarlos'}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') p.onAssistantSend();
                          }}
                        />
                        <button
                          type="button"
                          className="bcc-hero-send"
                          onClick={() => p.onAssistantSend()}
                          disabled={
                            p.txAssistantLoading ||
                            p.documentsLoading ||
                            (
                              !p.txAssistantInput.trim() &&
                              p.pendingEvidenceFiles.length === 0 &&
                              p.pendingManualEvidence.length === 0
                            ) ||
                            (
                              p.analysisAlreadyDone &&
                              (p.pendingEvidenceFiles.length > 0 || p.pendingManualEvidence.length > 0)
                            )
                          }
                          aria-label="Enviar"
                          title="Enviar"
                        >
                          Enviar
                        </button>
                      </div>
                      )}

                      {(p.pendingEvidenceFiles.length > 0 || p.pendingManualEvidence.length > 0) && p.analysisAlreadyDone && (
                        <p className="manual-evidence-hint">Este producto ya tiene análisis. Para nuevos antecedentes debes recrear el producto.</p>
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
                                  p.onRefineSummary(
                                    kicker ? `hallazgo "${kicker}"` : 'hallazgo del resumen',
                                    body,
                                  )
                                }
                              />
                            </div>
                            <div className="tx-chat-summary-meta">
                              <span className="tx-meta-card-kicker">
                                {p.summaryGeneratedAt ? `Actualizado ${new Date(p.summaryGeneratedAt).toLocaleString('es-CL')}` : 'Resumen listo'}
                              </span>
                              {p.summaryModel ? <span className="tx-meta-card-kicker">Modelo: {p.summaryModel}</span> : null}
                              <span className="tx-meta-card-kicker">Revisiones restantes: {p.summaryRegenerationsLeft}</span>
                              <span className="tx-meta-card-kicker">Doble clic en hallazgos o respuestas para reanalizar</span>
                            </div>
                          </div>
                          <div className="agent-modal-actions tx-flow-inline-actions">
                            <button
                              type="button"
                              className="continue-ghost"
                              onClick={() => p.onGoToAnalyst()}
                            >
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
