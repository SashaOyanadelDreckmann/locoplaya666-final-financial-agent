'use client';

import { createPortal } from 'react-dom';
import ModalNumbersCanvas from '@/components/agente/ModalNumbersCanvas';
import { MAX_TRANSACTION_PRODUCTS_CREATED_TOTAL } from '../../utilidades/agent-page.constants';
import { TxEvidenceStep } from './TxEvidenceStep';
import { TxAnalystDashboard } from './TxAnalystDashboard';
import { NumericDust } from './presentation';
import { TxConsentStep } from './TxConsentStep';
import { AgentModalCloseButton } from '../comunes/AgentModalCloseButton';
import { TxCloseConfirmDialog } from './TxCloseConfirmDialog';
import { TxEvidenceResetConfirmDialog } from './TxEvidenceResetConfirmDialog';
import { TxContinueWithoutProducts } from './TxContinueWithoutProducts';
import { TxEmptyState } from './TxEmptyState';
import { TxOperationalLimitsCard } from './TxOperationalLimitsCard';
import { TxPresetGate } from './TxPresetGate';
import type { TransactionsModalProps } from './types';
import { TxLibraryCardStack } from './TxLibraryCardStack';
import { TxMinimalSummaryChatStep } from './TxMinimalSummaryChatStep';
import { TxAnalystExperiencePending } from './TxAnalystExperiencePending';
import { useTransactionsModalOrchestrator } from './use-transactions-modal-orchestrator';

export function TransactionsModal(props: TransactionsModalProps) {
  const vm = useTransactionsModalOrchestrator(props);
  const { assistant } = vm;

  if (!props.isOpen) return null;

  const modalTree = (
    <div className="agent-modal-overlay transactions-modal-overlay" onClick={vm.requestClose}>
      <div
        className="agent-modal transactions-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="transactions-modal-title"
        tabIndex={-1}
        ref={vm.transactionsModalRef}
        onClick={(e) => e.stopPropagation()}
        data-ui-version="v2"
        data-dock-phase={vm.dockTransitionPhase}
        data-stage={vm.currentStage}
        data-reduced-motion={vm.prefersReducedMotion ? 'true' : 'false'}
        style={{
          ['--tx-active-card-accent' as string]: vm.activeLibraryTheme.color,
          ['--tx-active-card-accent-edge' as string]: vm.activeLibraryTheme.edge,
        }}
      >
        {!vm.prefersReducedMotion ? (
          <ModalNumbersCanvas
            shuffleTrigger={vm.shuffleTrigger}
            transitionPhase={vm.dockTransitionPhase}
            pulse={vm.transitionPulse}
          />
        ) : null}
        {!vm.prefersReducedMotion ? (
          <div className="tx-transition-flood-layer" aria-hidden="true">
            <NumericDust
              scope="flood"
              pulse={vm.transitionPulse}
              active={vm.dockTransitionPhase !== 'idle'}
              count={42}
            />
          </div>
        ) : null}
        <div className="bcc-modal-header tx-modal-header-layer">
          <div className="bcc-modal-title-wrap">
            <span className="bcc-modal-eyebrow">Financieramente</span>
            <h3 id="transactions-modal-title" className="bcc-modal-title">
              Productos y transacciones
            </h3>
          </div>
          <AgentModalCloseButton
            onClick={vm.requestClose}
            aria-label="Cerrar panel de productos y transacciones"
          />
        </div>
        <div className="tx-scroll-body" ref={vm.txScrollBodyRef}>
          <section className="pt-shell tx-stage-shell tx-modal-header-layer">
            <aside className="pt-left tx-panel-surface tx-panel-surface--library">
              <NumericDust
                scope="library"
                pulse={vm.transitionPulse}
                active={!vm.prefersReducedMotion && vm.dockTransitionPhase !== 'idle'}
              />
              <div className="pt-list-head">
                <h4>Biblioteca de productos</h4>
                <div className="pt-list-head-actions">
                  <button
                    type="button"
                    className="continue-ghost tx-create-product-btn"
                    onClick={() => vm.handleCreateProduct()}
                    disabled={!vm.canAddMoreProducts}
                  >
                    + Agregar producto
                  </button>
                </div>
              </div>
              <div className="pt-list">
                {vm.libraryProductCards.length > 0 ? (
                  <TxLibraryCardStack
                    cards={vm.libraryProductCards}
                    productCarouselIndex={vm.productCarouselIndex}
                    recentlyDockedProductId={vm.recentlyDockedProductId}
                    prefersReducedMotion={vm.prefersReducedMotion}
                    transitionPulse={vm.transitionPulse}
                    onSelectAt={vm.selectLibraryProductAt}
                    onDelete={props.deleteTransactionProduct}
                  />
                ) : (
                  <div className="tx-library-empty">
                    <span className="tx-library-empty-kicker">Biblioteca vacía</span>
                    <p>Tus productos aparecen aquí al autorizarlos o cuando tengan evidencias en curso.</p>
                    {vm.onContinueWithoutProducts ? (
                      <TxContinueWithoutProducts onContinue={vm.onContinueWithoutProducts} compact />
                    ) : null}
                  </div>
                )}
              </div>
              <div className="tx-meta-stack" aria-label="Estado y límites del módulo">
                {props.creationNotice ? (
                  <div className="tx-meta-card is-warning" role="status">
                    <span className="tx-meta-card-kicker">Estado de creación</span>
                    <p>{props.creationNotice}</p>
                  </div>
                ) : null}
                <TxOperationalLimitsCard
                  activeCount={vm.activeProductCreations}
                  maxActive={props.maxProducts}
                  createdTotal={props.productsCreatedTotal}
                  maxCreatedTotal={MAX_TRANSACTION_PRODUCTS_CREATED_TOTAL}
                  canAddMore={vm.canAddMoreProducts}
                  onAddProduct={() => vm.handleCreateProduct()}
                />
                <div className="tx-batch-recommendation-banner" role="status" aria-live="polite">
                  <div className="tx-batch-recommendation-copy">
                    <span className="tx-batch-recommendation-kicker">Sincronización automática</span>
                    <p>
                      Cuando guardes productos con movimientos, el contexto validado se actualiza solo para el agente
                      principal.
                    </p>
                  </div>
                </div>
              </div>
            </aside>

            <div
              className={`pt-right tx-panel-surface tx-panel-surface--workspace ${!props.activeBankProduct || vm.showTxCarousel ? '' : 'tx-only-cta'}`}
            >
              <NumericDust
                scope="workspace"
                pulse={vm.transitionPulse}
                active={
                  !vm.prefersReducedMotion &&
                  (vm.dockTransitionPhase !== 'idle' || vm.currentStage !== 'consent')
                }
              />
              {props.activeBankProduct && vm.showTxCarousel && vm.activeTxStageIndex >= 0 ? (
                <nav className="tx-wizard-stepper" aria-label="Pasos del flujo de transacciones">
                  <ol className="tx-wizard-stepper-list">
                    {vm.txStages.map((stage, index) => {
                      const isCurrent = vm.activeTxStageIndex === index;
                      return (
                        <li key={stage.key} className="tx-wizard-stepper-item">
                          <button
                            type="button"
                            className={`tx-wizard-step ${isCurrent ? 'is-current' : ''} ${stage.disabled ? 'is-disabled' : ''}`}
                            onClick={() => vm.goToTxStage(stage.key)}
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
                <TxEmptyState
                  canAddMoreProducts={vm.canAddMoreProducts}
                  onCreateProduct={() => vm.handleCreateProduct()}
                  onContinueWithoutProducts={vm.onContinueWithoutProducts}
                />
              ) : (
                <>
                  {!vm.showTxCarousel ? (
                    <TxPresetGate
                      canAddMoreProducts={vm.canAddMoreProducts}
                      presets={vm.RECOMMENDED_TX_PRODUCTS}
                      onSelectPreset={vm.openAuthorizationWithPreset}
                      onCreateProduct={() => vm.handleCreateProduct()}
                      onContinueWithoutProducts={vm.onContinueWithoutProducts}
                    />
                  ) : (
                    <div className="tx-content-carousel">
                      {!vm.prefersReducedMotion &&
                        (vm.activeTxStageIndex === 0 ||
                          (vm.activeTxStageIndex === 1 && vm.isDockingToLibrary)) && (
                          <div className="tx-3d-hero-shell" aria-hidden="true">
                            <div className="relative w-full flex items-center justify-center p-0">
                              <div className="relative w-full py-0">
                                <div
                                  className={`tx-3d-sway-wrap${vm.txVisualStage === 'consent' && !vm.isDockingToLibrary ? ' is-floating' : ''}`}
                                >
                                  <div
                                    className={`tx-3d-hero ${vm.txVisualTone} ${vm.isCardLikeProduct ? 'is-card-like' : 'is-generic-like'} ${vm.activeTxStageIndex % 2 === 1 ? 'is-solid-step' : 'is-anim-step'} ${vm.isDockingToLibrary ? 'is-docking-out' : ''}`}
                                    style={{
                                      ['--tx-hero-base' as string]: vm.activeProductVisualPalette.base,
                                      ['--tx-hero-glow' as string]: vm.activeProductVisualPalette.glow,
                                      ['--tx-hero-edge' as string]: vm.activeProductVisualPalette.edge,
                                      ['--tx-hero-tint' as string]: vm.activeProductVisualPalette.tint,
                                      transform: `translate3d(0, ${vm.txVisualY}px, 0) rotateX(${vm.txVisualRotateX}deg) rotateY(${vm.txVisualRotateY}deg) scale(${vm.txVisualScale})`,
                                    }}
                                  >
                                    <NumericDust
                                      scope="hero"
                                      pulse={vm.transitionPulse}
                                      active={!vm.prefersReducedMotion && vm.dockTransitionPhase !== 'idle'}
                                    />
                                    <div className="tx-3d-hero-sheen" />
                                    <div className="tx-3d-hero-core">
                                      <span className="tx-3d-hero-eyebrow">
                                        {vm.isCardLikeProduct ? 'Producto financiero' : 'Instrumento financiero'}
                                      </span>
                                      <strong>
                                        {vm.resolvedProductLabel ||
                                          props.activeBankProduct.label ||
                                          'Producto activo'}
                                      </strong>
                                      <span>
                                        {vm.resolvedBank ||
                                          props.activeBankProduct.bank ||
                                          'Institución por definir'}
                                      </span>
                                    </div>
                                    <div className="tx-3d-hero-chip" />
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      {vm.activeTxStageIndex === 1 && !vm.isDockingToLibrary && !vm.prefersReducedMotion && (
                        <div className="tx-hero-shell-spacer" aria-hidden="true" />
                      )}
                      {vm.activeTxStageIndex === 0 && props.activeBankProduct && (
                        <TxConsentStep
                          quickBank={vm.quickBank}
                          productTemplate={vm.productTemplate}
                          showInstitutionCatalog={vm.showInstitutionCatalog}
                          showTemplateCatalog={vm.showTemplateCatalog}
                          filteredInstitutions={vm.filteredInstitutions}
                          filteredTemplates={vm.filteredTemplates}
                          consentAccepted={vm.consentAccepted}
                          consentLocked={vm.consentLocked}
                          canContinueAuto={vm.canContinueAuto}
                          consentGuidance={vm.consentGuidance}
                          isDockingToLibrary={vm.isDockingToLibrary}
                          transactionUploadError={props.transactionUploadError}
                          onBankChange={(value) => {
                            vm.setQuickBank(value);
                            vm.setShowInstitutionCatalog(true);
                          }}
                          onTemplateChange={(value) => {
                            vm.setProductTemplate(value);
                            vm.setShowTemplateCatalog(true);
                          }}
                          onOpenInstitutionCatalog={() => vm.setShowInstitutionCatalog(true)}
                          onOpenTemplateCatalog={() => vm.setShowTemplateCatalog(true)}
                          onToggleInstitutionCatalog={() => vm.setShowInstitutionCatalog((prev) => !prev)}
                          onToggleTemplateCatalog={() => vm.setShowTemplateCatalog((prev) => !prev)}
                          onSelectInstitution={(institution) => {
                            vm.setQuickBank(`${institution} (simulacion)`);
                            vm.setShowInstitutionCatalog(false);
                          }}
                          onSelectTemplate={(template) => {
                            vm.setProductTemplate(template);
                            vm.setShowTemplateCatalog(false);
                          }}
                          onToggleConsent={() => {
                            if (vm.consentLocked) return;
                            const nextAccepted = !vm.consentAccepted;
                            vm.setConsentAccepted(nextAccepted);
                            props.updateActiveProduct({
                              simulationAccepted: nextAccepted,
                              connected: false,
                            });
                          }}
                          onDeleteProduct={() => props.deleteTransactionProduct(props.activeBankProduct!.id)}
                          onContinue={vm.startAuthorizationTransition}
                        />
                      )}

                      {vm.activeTxStageIndex === 1 && props.activeBankProduct && (
                        <TxEvidenceStep
                          key={`tx-evidence-${props.selectedProductId}`}
                          activeBankProduct={props.activeBankProduct}
                          maxEvidenceFilesPerProduct={props.maxEvidenceFilesPerProduct}
                          summaryRegenerationsLeft={assistant.summaryRegenerationsLeft}
                          transitionPulse={vm.transitionPulse}
                          dockTransitionPhase={vm.dockTransitionPhase}
                          currentStage={vm.currentStage}
                          scrollRef={vm.txSummaryScrollRef}
                          assistantMessages={assistant.evidenceAssistantMessages}
                          highlightedMovementKeys={assistant.highlightedMovementKeys}
                          analysisAlreadyDone={vm.analysisAlreadyDone}
                          txUploadOnboardingStep={assistant.txUploadOnboardingStep}
                          selectedUploadFormat={vm.selectedUploadFormat}
                          pendingEvidenceFiles={assistant.pendingEvidenceFiles}
                          txAssistantInput={assistant.txAssistantInput}
                          txAssistantLoading={assistant.txAssistantLoading}
                          documentsLoading={props.documentsLoading}
                          transactionUploadError={props.transactionUploadError}
                          summaryText={assistant.summaryText}
                          summaryGeneratedAt={assistant.summaryGeneratedAt}
                          summaryModel={assistant.summaryModel}
                          processingModeLabel={assistant.processingModeLabel}
                          processingMetaLabel={assistant.processingMetaLabel}
                          processingPrimaryCopy={assistant.processingPrimaryCopy}
                          documentsParseProgress={props.documentsParseProgress}
                          txAssistantError={assistant.txAssistantError}
                          txAssistantNotice={vm.txAssistantNotice}
                          chatThreadRef={vm.txChatThreadRef}
                          evidenceResetsLeft={vm.evidenceResetsLeft}
                          onRequestEvidenceReset={vm.requestEvidenceReset}
                          onPatchUploadFormat={(format) => assistant.patchAssistant({ uploadFormat: format })}
                          onResetUploadFormat={() => assistant.patchAssistant({ uploadFormat: null })}
                          onSetUploadOnboardingStep={assistant.setActiveUploadOnboardingStep}
                          onBumpTransitionPulse={vm.bumpTransitionPulse}
                          onAppendPendingEvidence={assistant.appendPendingEvidence}
                          onAssistantInputChange={assistant.setActiveTxAssistantInput}
                          onAssistantSend={() => void assistant.handleAssistantTextSend()}
                          analystContinueLabel={vm.analystContinueLabel}
                          analystContinueDisabled={vm.isAnalystExperiencePending}
                          onGoToAnalyst={() => vm.goToTxStage('analyst')}
                          onRegenerateSummary={() =>
                            void assistant.generateTransactionSummary({
                              feedback: 'Revisar nuevamente consistencia de movimientos y resumen.',
                              isRegeneration: true,
                            })
                          }
                        />
                      )}

                      {vm.activeTxStageIndex === 2 && props.activeBankProduct && vm.isAnalystExperiencePending && (
                        <TxAnalystExperiencePending
                          reason={vm.analystExperienceReason ?? 'Preparando análisis…'}
                          documentsLoading={props.documentsLoading}
                          txAssistantLoading={assistant.txAssistantLoading}
                          documentsParseProgress={props.documentsParseProgress}
                          processingModeLabel={assistant.processingModeLabel}
                          processingMetaLabel={assistant.processingMetaLabel}
                          processingPrimaryCopy={assistant.processingPrimaryCopy}
                        />
                      )}

                      {vm.activeTxStageIndex === 2 && props.activeBankProduct && !vm.isAnalystExperiencePending && !vm.isMinimalSummaryChatStep && (
                        <TxAnalystDashboard
                          analytics={vm.analytics}
                          activeBankProduct={props.activeBankProduct}
                          summaryText={assistant.summaryText}
                          summaryGeneratedAt={assistant.summaryGeneratedAt}
                          summaryModel={assistant.summaryModel}
                          hasSummary={assistant.hasSummary}
                          summaryRegenerationsLeft={assistant.summaryRegenerationsLeft}
                          showAllMovements={vm.showAllMovements}
                          onToggleShowAllMovements={() => vm.setShowAllMovements((prev) => !prev)}
                          execTab={vm.execTab}
                          onExecTabChange={vm.setExecTab}
                          selectedMovement={vm.selectedMovement}
                          selectedMovementKey={vm.selectedMovementKey}
                          onSelectMovementKey={vm.setSelectedMovementKey}
                          overrideMerchantDraft={vm.overrideMerchantDraft}
                          onOverrideMerchantDraftChange={vm.setOverrideMerchantDraft}
                          overrideCategoryDraft={vm.overrideCategoryDraft}
                          onOverrideCategoryDraftChange={vm.setOverrideCategoryDraft}
                          groupCarouselRef={vm.groupCarouselRef}
                          insightCarouselRef={vm.insightCarouselRef}
                          onCarouselPause={vm.pauseCarousel}
                          onCarouselResume={vm.resumeCarousel}
                          assistantMessages={assistant.summaryAssistantMessages}
                          starterChips={assistant.starterChips}
                          highlightedMovementKeys={assistant.highlightedMovementKeys}
                          txAssistantInput={assistant.txAssistantInput}
                          onAssistantInputChange={assistant.setActiveTxAssistantInput}
                          txAssistantLoading={assistant.txAssistantLoading}
                          documentsLoading={props.documentsLoading}
                          onAskSuggestedQuestion={vm.handleAskSuggestedQuestion}
                          isSavedForBatch={vm.isSavedForBatch}
                          onDeleteProduct={() => props.deleteTransactionProduct(props.activeBankProduct!.id)}
                          onGoToEvidence={() => vm.goToTxStage('evidence')}
                          onRequestEvidenceReset={vm.requestEvidenceReset}
                          evidenceResetsLeft={vm.evidenceResetsLeft}
                          onSaveProductForBatch={() => {
                            const saved = props.saveTransactionProductForBatch();
                            if (saved) {
                              props.setTxWizardStep('products');
                              vm.setShowTxCarousel(false);
                            }
                          }}
                          onRefineSummary={(source, body) =>
                            void assistant.refineTransactionSummaryFromFocus(source, body)
                          }
                          onRegenerateSummary={() =>
                            void assistant.generateTransactionSummary({
                              feedback: 'Revisar nuevamente consistencia de movimientos y resumen.',
                              isRegeneration: true,
                            })
                          }
                          onAssistantSend={() => void assistant.handleAssistantTextSend()}
                          onSaveMovementOverride={vm.saveSelectedMovementOverride}
                          onClearMovementOverride={vm.clearSelectedMovementOverride}
                          buildMovementRefinementText={vm.buildMovementRefinementTextForModal}
                        />
                      )}

                      {vm.activeTxStageIndex === 2 && props.activeBankProduct && !vm.isAnalystExperiencePending && vm.isMinimalSummaryChatStep && (
                        <TxMinimalSummaryChatStep
                          summaryText={assistant.summaryText}
                          summaryGeneratedAt={assistant.summaryGeneratedAt}
                          summaryModel={assistant.summaryModel}
                          summaryRegenerationsLeft={assistant.summaryRegenerationsLeft}
                          experienceNote={vm.analystExperienceReason}
                          isSummaryPending={props.documentsLoading || assistant.txAssistantLoading}
                          assistantMessages={assistant.summaryAssistantMessages}
                          starterChips={assistant.starterChips}
                          highlightedMovementKeys={assistant.highlightedMovementKeys}
                          txAssistantInput={assistant.txAssistantInput}
                          txAssistantLoading={assistant.txAssistantLoading}
                          documentsLoading={props.documentsLoading}
                          onAssistantInputChange={assistant.setActiveTxAssistantInput}
                          onAssistantSend={() => void assistant.handleAssistantTextSend()}
                          onAskSuggestedQuestion={vm.handleAskSuggestedQuestion}
                        />
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </section>
        </div>
        {vm.closeConfirmKind ? (
          <TxCloseConfirmDialog
            kind={vm.closeConfirmKind}
            onDismiss={vm.dismissCloseConfirm}
            onConfirm={vm.confirmClose}
          />
        ) : null}
        {vm.evidenceResetConfirmOpen ? (
          <TxEvidenceResetConfirmDialog
            resetsLeft={vm.evidenceResetsLeft}
            onDismiss={vm.dismissEvidenceResetConfirm}
            onConfirm={vm.confirmEvidenceReset}
          />
        ) : null}
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalTree, document.body);
}
