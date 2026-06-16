/** @jest-environment node */

/**
 * Legacy guard tests were migrated to RTL behavioral coverage in
 * transactions-modal.behavior.test.tsx. This file keeps lightweight
 * integration checks that do not require jsdom.
 */

import fs from 'node:fs';
import path from 'node:path';

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('transactions modal integration guards', () => {
  it('keeps upload limits and evidence reset constants aligned', () => {
    expect(read('app/agent/modales/transacciones/constants.ts')).toContain('TX_MAX_SINGLE_FILE_BYTES = 10 * 1024 * 1024');
    expect(read('app/agent/utilidades/agent-page.constants.ts')).toContain('MAX_TRANSACTION_EVIDENCE_RESETS = 3');
    expect(read('app/agent/page.tsx')).toContain('resetTransactionProductEvidence');
    expect(read('app/agent/page.tsx')).toContain('buildEvidenceResetPatch');
  });

  it('keeps orchestrator extracted from TransactionsModal', () => {
    const modal = read('app/agent/modales/transacciones/TransactionsModal.tsx');
    const orchestrator = read('app/agent/modales/transacciones/use-transactions-modal-orchestrator.ts');

    expect(modal).toContain('useTransactionsModalOrchestrator');
    expect(orchestrator).toContain('carouselPaused');
    expect(orchestrator).toContain('evidenceResetConfirmOpen');
    expect(orchestrator).toContain('useTxModalA11y');
  });

  it('keeps analyst dashboard split into focused subcomponents', () => {
    const dashboard = read('app/agent/modales/transacciones/TxAnalystDashboard.tsx');
    expect(dashboard).toContain('TxMovementTable');
    expect(dashboard).toContain('TxMovementEditor');
    expect(dashboard).toContain('TxExecutiveSummary');
    expect(dashboard).toContain('tx-ap-hero-numbers');
  });

  it('does not expose rapid video upload in the evidence step', () => {
    const source = read('app/agent/modales/transacciones/TxEvidenceStep.tsx');
    expect(source).not.toContain("['video', 'Rápido', 'Video']");
    expect(source).not.toContain('video/mp4,video/quicktime,video/webm');
    expect(source).not.toContain('tx-chat-summary-bridge');
    expect(source).not.toContain('Resumen listo');
  });
});
