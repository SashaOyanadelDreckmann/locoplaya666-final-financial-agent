/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('transactions modal safeguards', () => {
  it('keeps orchestrator wiring, a11y hooks, and upload limits in place', () => {
    const modal = read('app/agent/transactions/TransactionsModal.tsx');
    const assistantChat = read('app/agent/transactions/use-tx-assistant-chat.ts');
    const actionSession = read('app/agent/transactions/use-tx-action-session.ts');
    const modalA11y = read('app/agent/transactions/use-tx-modal-a11y.ts');
    const dockTransition = read('app/agent/transactions/use-tx-dock-transition.ts');
    const closeConfirm = read('app/agent/transactions/use-tx-close-confirm.ts');
    const closeConfirmDialog = read('app/agent/transactions/TxCloseConfirmDialog.tsx');
    const constants = read('app/agent/transactions/constants.ts');
    const pageConstants = read('app/agent/agent-page.constants.ts');

    expect(constants).toContain('TX_MAX_SINGLE_FILE_BYTES = 10 * 1024 * 1024');
    expect(constants).toContain('TX_MAX_TOTAL_FILE_BYTES = 50 * 1024 * 1024');
    expect(pageConstants).toContain('MAX_TRANSACTION_PRODUCTS = 7');
    expect(pageConstants).toContain('MAX_TRANSACTION_PRODUCTS_CREATED_TOTAL = 12');
    expect(pageConstants).toContain('MAX_EVIDENCE_FILES_PER_PRODUCT = 25');

    expect(modal).toContain('const transactionsModalRef = useRef<HTMLDivElement | null>(null);');
    expect(modal).toContain('useTxAssistantChat');
    expect(modal).toContain('useTxCloseConfirm');
    expect(modal).toContain('useTxModalA11y');
    expect(modal).toContain('useTxModalScrollLock');
    expect(modal).toContain('txScrollBodyRef');
    expect(modal).toContain('useTxDockTransition');
    expect(modal).toContain("props.txWizardStep === 'products'");
    expect(modal).toContain('setSelectedMovementKey(null);');
    expect(modal).not.toContain('transactions-modal-intro');
    expect(modal).not.toContain('tx-flow-status-card');
    expect(modal).toContain('tabIndex={-1}');
    expect(modal).toContain('tx-batch-recommendation-banner" role="status" aria-live="polite"');
    expect(modal).toContain('Productos y transacciones');
    expect(modal).toContain("props.setTxWizardStep('products');");
    expect(modal).toContain('if (!props.activeBankProduct?.id) return;');
    expect(closeConfirmDialog).toContain('role="alertdialog"');
    expect(modal).toContain('tx-wizard-stepper');

    expect(actionSession).toContain('const txSessionIdRef = useRef(0);');
    expect(actionSession).toContain('const invalidateTxSession = useCallback');
    expect(actionSession).toContain('previousActiveProductIdRef');
    expect(actionSession).toContain('isTxActionStale');

    expect(assistantChat).toContain('pendingEvidenceFilesByProduct');
    expect(assistantChat).toContain('txAssistantInputByProduct');
    expect(assistantChat).toContain('txUploadOnboardingStepByProduct');
    expect(assistantChat).toContain('txAssistantLoadingByProduct');
    expect(assistantChat).toContain('isTxActionStale(sessionId, productId)');
    expect(assistantChat).toContain('controller.signal');
    expect(read('app/agent/transactions/tx-assistant.helpers.ts')).toContain('grabaci[oó]n|pantalla|screen');

    expect(modalA11y).toContain("if (event.key !== 'Tab') return;");

    expect(dockTransition).toContain('hasPendingAuthorization');
    expect(dockTransition).toContain('simulateBankLogin');

    expect(closeConfirm).toContain('clearDraft');
    expect(closeConfirm).toContain('const requestClose = useCallback');
  });

  it('keeps product upload isolation and canonical document ids', () => {
    const source = read('app/agent/page.tsx');

    expect(source).toContain('const targetProductId = activeBankProduct.id;');
    expect(source).toContain('normalizeParsedUploadDocuments');
    expect(source).toContain('applyUploadToTargetProduct');
    expect(source).toContain('const fallbackParsedDocs =');
    expect(source).toContain('if (fallbackParsedDocs.length === 0)');
    expect(source).toContain('No se detectó contenido transaccional en esos archivos');
    expect(source).toContain('const totalBytes = selectedFiles.reduce((sum, file) => sum + file.size, 0);');
    expect(source).toContain('TX_MAX_TOTAL_FILE_BYTES');
    expect(source).toContain('getEvidenceUploadCapacity');
    expect(source).toContain('let parsed = await callParseDocuments();');
    expect(source).toContain('await new Promise((resolve) => setTimeout(resolve, 700));');
    expect(source).not.toContain(
      'const uploadApplied = applyUploadToTargetProduct(prev.products, targetProductId, [], names);',
    );
  });

  it('does not expose rapid video upload in the evidence step', () => {
    const source = read('app/agent/transactions/TxEvidenceStep.tsx');

    expect(source).not.toContain("['video', 'Rápido', 'Video']");
    expect(source).not.toContain('video/mp4,video/quicktime,video/webm');
    expect(source).not.toContain('/generated/transactions-fast-example.mp4');
    expect(source).toContain('tx-format-rail-chip-label-short');
  });

  it('routes indicative and photo/text evidence into the minimal summary chat', () => {
    const helpers = read('app/agent/transactions/transactions-modal.helpers.ts');
    const modal = read('app/agent/transactions/TransactionsModal.tsx');
    const minimalStep = read('app/agent/transactions/TxMinimalSummaryChatStep.tsx');

    expect(helpers).toContain('shouldUseMinimalSummaryChat');
    expect(helpers).toContain("evidenceFidelity === 'indicative'");
    expect(helpers).toContain("selectedUploadFormat === 'photos'");
    expect(helpers).toContain("selectedUploadFormat === 'text'");
    expect(modal).toContain('isMinimalSummaryChatStep');
    expect(modal).toContain('TxMinimalSummaryChatStep');
    expect(minimalStep).toContain('tx-minimal-send-btn');
    expect(minimalStep).not.toContain('TxChatStarterChips');
    expect(minimalStep).not.toContain('TxAskChatButton');
  });
});
