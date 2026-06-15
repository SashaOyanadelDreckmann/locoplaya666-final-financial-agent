/** @jest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react';
import { TransactionsModal } from '../modales/transacciones/TransactionsModal';
import { TxConsentStep } from '../modales/transacciones/TxConsentStep';
import { TxEvidenceStep } from '../modales/transacciones/TxEvidenceStep';
import { buildEvidenceResetPatch } from '../modales/transacciones/state.helpers';
import { MAX_TRANSACTION_EVIDENCE_RESETS } from '../utilidades/agent-page.constants';
import type { BankProduct, TransactionsModalProps } from '../modales/transacciones/types';

jest.mock('@/components/agente/ModalNumbersCanvas', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../modales/transacciones/TxAnalystDashboard', () => ({
  TxAnalystDashboard: ({
    onCarouselPause,
    onCarouselResume,
    onRequestEvidenceReset,
  }: {
    onCarouselPause?: () => void;
    onCarouselResume?: () => void;
    onRequestEvidenceReset?: () => void;
  }) => (
    <div data-testid="tx-analyst-step">
      <button type="button" onMouseEnter={onCarouselPause} onMouseLeave={onCarouselResume}>
        Carrusel
      </button>
      {onRequestEvidenceReset ? (
        <button type="button" onClick={onRequestEvidenceReset}>
          Reiniciar evidencia analista
        </button>
      ) : null}
    </div>
  ),
}));

function buildProduct(overrides: Partial<BankProduct> = {}): BankProduct {
  return {
    id: 'prod-behavior-1',
    label: 'Cuenta corriente',
    bank: 'Banco de Chile (simulacion)',
    assistant: {
      messages: [{ id: 'm1', role: 'assistant', text: 'Hola', createdAt: new Date().toISOString() }],
      uploadFormat: 'pdf',
      summaryText: 'Resumen previo',
      summaryModel: 'instant-heuristic',
      summaryGeneratedAt: new Date().toISOString(),
      summaryRegenerationsUsed: 0,
      lastSummaryFeedback: null,
    },
    productType: 'checking_account',
    simulationAccepted: true,
    connected: true,
    randomMode: false,
    uploadedFiles: ['cartola.pdf'],
    parsedDocuments: [{ name: 'cartola.pdf', text: 'movimiento 1000' }],
    evidenceResetsUsed: 0,
    ...overrides,
  };
}

function buildBaseProps(overrides: Partial<TransactionsModalProps> = {}): TransactionsModalProps {
  const product = buildProduct();
  return {
    isOpen: true,
    onClose: jest.fn(),
    txWizardStep: 'dashboard',
    setTxWizardStep: jest.fn(),
    activeBankProduct: product,
    transactionProductCards: [
      { product, descriptor: { title: 'x', description: '', insights: [], themeColor: '#000' }, intel: { docs: 1, amounts: [1000] } },
    ],
    selectedProductId: product.id,
    selectTransactionProduct: jest.fn(),
    deleteTransactionProduct: jest.fn(),
    addTransactionProduct: jest.fn(),
    updateActiveProduct: jest.fn(),
    updateProductById: jest.fn(),
    transactionTaxonomyOverrides: [],
    upsertTransactionTaxonomyOverride: jest.fn(),
    removeTransactionTaxonomyOverride: jest.fn(),
    simulateBankLogin: jest.fn(() => true),
    onUploadStatement: jest.fn(async () => null),
    documentsLoading: false,
    transactionUploadError: null,
    saveTransactionProductForBatch: jest.fn(() => true),
    savedProductIds: [],
    maxProducts: 7,
    maxEvidenceFilesPerProduct: 25,
    productsCreatedTotal: 1,
    creationNotice: null,
    resetTransactionProductEvidence: jest.fn(() => true),
    maxEvidenceResets: MAX_TRANSACTION_EVIDENCE_RESETS,
    ...overrides,
  };
}

describe('transactions modal behavioral safeguards', () => {
  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('renders dialog with stepper, batch banner and close confirmation while busy', () => {
    const onClose = jest.fn();
    const product = buildProduct();
    render(
      <TransactionsModal
        {...buildBaseProps({
          onClose,
          txWizardStep: 'upload',
          documentsLoading: true,
          activeBankProduct: product,
        })}
      />,
    );

    expect(screen.getByRole('dialog')).toHaveAttribute('aria-labelledby', 'transactions-modal-title');
    expect(screen.getByText('Productos y transacciones')).toBeInTheDocument();
    expect(screen.getByText(/Sincronización automática/i)).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: /pasos del flujo de transacciones/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /cerrar panel de productos y transacciones/i }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('opens evidence reset confirmation and calls reset handler on confirm', async () => {
    const resetTransactionProductEvidence = jest.fn(() => true);
    render(
      <TransactionsModal
        {...buildBaseProps({
          txWizardStep: 'upload',
          resetTransactionProductEvidence,
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /reiniciar evidencia \(3\)/i }));

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Reiniciar evidencia' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /reiniciar y volver a evidencia/i }));
    expect(resetTransactionProductEvidence).toHaveBeenCalledTimes(1);
  });

  it('locks consent toggle when product is already authorized', () => {
    render(
      <TxConsentStep
        quickBank="Banco de Chile (simulacion)"
        productTemplate="Cuenta corriente"
        showInstitutionCatalog={false}
        showTemplateCatalog={false}
        filteredInstitutions={[]}
        filteredTemplates={[]}
        consentAccepted
        consentLocked
        isDockingToLibrary={false}
        canContinueAuto
        onBankChange={jest.fn()}
        onTemplateChange={jest.fn()}
        onOpenInstitutionCatalog={jest.fn()}
        onOpenTemplateCatalog={jest.fn()}
        onToggleInstitutionCatalog={jest.fn()}
        onToggleTemplateCatalog={jest.fn()}
        onSelectInstitution={jest.fn()}
        onSelectTemplate={jest.fn()}
        onToggleConsent={jest.fn()}
        onDeleteProduct={jest.fn()}
        onContinue={jest.fn()}
      />,
    );

    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-disabled', 'true');
  });

  it('exposes aria-expanded on institution and template catalog toggles', () => {
    render(
      <TxConsentStep
        quickBank=""
        productTemplate=""
        showInstitutionCatalog
        showTemplateCatalog={false}
        filteredInstitutions={['Banco de Chile']}
        filteredTemplates={[]}
        consentAccepted={false}
        isDockingToLibrary={false}
        canContinueAuto={false}
        onBankChange={jest.fn()}
        onTemplateChange={jest.fn()}
        onOpenInstitutionCatalog={jest.fn()}
        onOpenTemplateCatalog={jest.fn()}
        onToggleInstitutionCatalog={jest.fn()}
        onToggleTemplateCatalog={jest.fn()}
        onSelectInstitution={jest.fn()}
        onSelectTemplate={jest.fn()}
        onToggleConsent={jest.fn()}
        onDeleteProduct={jest.fn()}
        onContinue={jest.fn()}
      />,
    );

    const institutionToggle = screen.getByRole('button', { name: /ocultar catálogo/i });
    expect(institutionToggle).toHaveAttribute('aria-expanded', 'true');
    expect(institutionToggle).toHaveAttribute('aria-controls', 'tx-institution-catalog');
    expect(screen.getByRole('listbox', { name: /instituciones sugeridas/i })).toBeInTheDocument();
  });

  it('shows evidence reset action on evidence step when analysis already exists', () => {
    const onRequestEvidenceReset = jest.fn();
    render(
      <TxEvidenceStep
        activeBankProduct={buildProduct()}
        maxEvidenceFilesPerProduct={25}
        scrollRef={{ current: null }}
        assistantMessages={[]}
        analysisAlreadyDone
        txUploadOnboardingStep="upload"
        selectedUploadFormat="pdf"
        pendingEvidenceFiles={[]}
        txAssistantInput=""
        txAssistantLoading={false}
        documentsLoading={false}
        processingModeLabel=""
        processingMetaLabel=""
        processingPrimaryCopy=""
        txAssistantError={null}
        evidenceResetsLeft={2}
        onRequestEvidenceReset={onRequestEvidenceReset}
        onPatchUploadFormat={jest.fn()}
        onResetUploadFormat={jest.fn()}
        onSetUploadOnboardingStep={jest.fn()}
        onBumpTransitionPulse={jest.fn()}
        onAppendPendingEvidence={jest.fn()}
        onAssistantInputChange={jest.fn()}
        onAssistantSend={jest.fn()}
        onGoToAnalyst={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /reiniciar evidencia \(2\)/i }));
    expect(onRequestEvidenceReset).toHaveBeenCalledTimes(1);
  });

  it('buildEvidenceResetPatch clears assistant messages and parsed documents', () => {
    const patch = buildEvidenceResetPatch(1);
    expect(patch.parsedDocuments).toEqual([]);
    expect(patch.uploadedFiles).toEqual([]);
    expect(patch.evidenceResetsUsed).toBe(1);
    expect(patch.assistant?.messages).toEqual([]);
    expect(patch.assistant?.summaryText).toBeNull();
  });
});

describe('TransactionsModal consent with orchestrator', () => {
  it('disables authorization step when product is already connected', () => {
    render(
      <TransactionsModal
        {...buildBaseProps({
          txWizardStep: 'upload',
          activeBankProduct: buildProduct({ connected: true }),
        })}
      />,
    );

    expect(screen.getByRole('button', { name: /1\. autorización/i })).toBeDisabled();
  });
});
