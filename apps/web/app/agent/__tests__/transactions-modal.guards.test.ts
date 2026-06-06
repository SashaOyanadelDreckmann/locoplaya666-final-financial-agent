/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';

describe('transactions modal safeguards', () => {
  it('keeps a11y focus guards and upload limits in place', () => {
    const sourcePath = path.join(process.cwd(), 'app', 'agent', 'transactions', 'TransactionsModal.tsx');
    const source = fs.readFileSync(sourcePath, 'utf8');

    const constantsPath = path.join(process.cwd(), 'app', 'agent', 'transactions', 'constants.ts');
    const constants = fs.readFileSync(constantsPath, 'utf8');
    const pageConstantsPath = path.join(process.cwd(), 'app', 'agent', 'agent-page.constants.ts');
    const pageConstants = fs.readFileSync(pageConstantsPath, 'utf8');
    expect(constants).toContain('TX_MAX_SINGLE_FILE_BYTES = 10 * 1024 * 1024');
    expect(constants).toContain('TX_MAX_TOTAL_FILE_BYTES = 35 * 1024 * 1024');
    expect(pageConstants).toContain('MAX_TRANSACTION_PRODUCTS = 7');
    expect(pageConstants).toContain('MAX_TRANSACTION_PRODUCTS_CREATED_TOTAL = 12');
    expect(pageConstants).toContain('MAX_EVIDENCE_FILES_PER_PRODUCT = 25');
    expect(source).toContain('const transactionsModalRef = useRef<HTMLDivElement | null>(null);');
    expect(source).toContain("props.txWizardStep === 'products'");
    expect(source).toContain("setShowTxCarousel(props.txWizardStep !== 'products');");
    expect(source).toContain('pendingEvidenceFilesByProduct');
    expect(source).toContain('txAssistantInputByProduct');
    expect(source).toContain('txAssistantLoadingByProduct');
    expect(source).toContain("setSelectedMovementKey(null);");
    expect(source).toContain("if (event.key !== 'Tab') return;");
    expect(source).toContain('aria-describedby="transactions-modal-intro"');
    expect(source).toContain('tabIndex={-1}');
    expect(source).toContain('tx-batch-recommendation-banner" role="status" aria-live="polite"');
    expect(source).toContain('Productos y transacciones');
    expect(source).toContain('const requestClose = useCallback');
    expect(source).toContain('clearPendingEvidence();');
    expect(source).toContain('grabaci[oó]n|pantalla|screen');
    expect(source).toContain("props.setTxWizardStep('products');");
  });

  it('keeps product upload isolation and canonical document ids', () => {
    const sourcePath = path.join(process.cwd(), 'app', 'agent', 'page.tsx');
    const source = fs.readFileSync(sourcePath, 'utf8');

    expect(source).toContain('const targetProductId = activeBankProduct.id;');
    expect(source).toContain('normalizeParsedUploadDocuments');
    expect(source).toContain('applyUploadToTargetProduct');
    expect(source).toContain('const fallbackParsedDocs =');
    expect(source).toContain('if (fallbackParsedDocs.length === 0)');
    expect(source).toContain('No se detectó contenido transaccional en esos archivos');
    expect(source).toContain('const totalBytes = selectedFiles.reduce((sum, file) => sum + file.size, 0);');
    expect(source).toContain('if (totalBytes > 35 * 1024 * 1024)');
    expect(source).toContain('let parsed = await callParseDocuments();');
    expect(source).toContain('await new Promise((resolve) => setTimeout(resolve, 700));');
    expect(source).not.toContain('const uploadApplied = applyUploadToTargetProduct(prev.products, targetProductId, [], names);');
  });

  it('keeps the rapid upload mode visible in the evidence step', () => {
    const sourcePath = path.join(process.cwd(), 'app', 'agent', 'transactions', 'TxEvidenceStep.tsx');
    const source = fs.readFileSync(sourcePath, 'utf8');

    expect(source).toContain("['video', 'Rápido']");
    expect(source).toContain('video/mp4,video/quicktime,video/webm');
    expect(source).toContain('grabación rápida de pantalla');
    expect(source).toContain('/generated/transactions-fast-example.mp4');
    expect(source).toContain('Ver ejemplo');
  });
});
