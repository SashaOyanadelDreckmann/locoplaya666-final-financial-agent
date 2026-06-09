/** @jest-environment jsdom */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { TransactionsModal } from '../TransactionsModal';
import type { BankProduct, TransactionsModalProps, TxWizardStep } from '../types';

jest.mock('@/components/agent/ModalNumbersCanvas', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../TxEvidenceStep', () => ({
  TxEvidenceStep: () => <div data-testid="tx-evidence-step">Evidencias</div>,
}));

jest.mock('../TxAnalystDashboard', () => ({
  TxAnalystDashboard: () => <div data-testid="tx-analyst-step">Resumen</div>,
}));

function buildProduct(overrides: Partial<BankProduct> = {}): BankProduct {
  return {
    id: 'prod-wizard-1',
    label: 'Cuenta corriente',
    bank: 'Banco de Chile (simulacion)',
    assistant: {
      messages: [],
      uploadFormat: null,
      summaryText: 'Resumen listo',
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
    dashboard: {
      evidenceFidelity: 'authoritative',
      keyMetrics: {
        inflows_total: 0,
        outflows_total: 5000,
        net_flow: -5000,
        avg_movement: 1000,
        movement_count: 5,
      },
      movements: Array.from({ length: 5 }, (_, index) => ({
        description: `Movimiento ${index + 1}`,
        amount: 1000,
        direction: 'expense' as const,
        source_kind: 'line' as const,
      })),
    },
    ...overrides,
  };
}

function WizardHarness({ initialStep = 'upload' as TxWizardStep }) {
  const [product] = useState(() => buildProduct());
  const [txWizardStep, setTxWizardStep] = useState<TxWizardStep>(initialStep);

  const props: TransactionsModalProps = {
    isOpen: true,
    onClose: jest.fn(),
    txWizardStep,
    setTxWizardStep,
    activeBankProduct: product,
    transactionProductCards: [{ product, descriptor: { title: 'x', description: '', insights: [], themeColor: '#000' }, intel: { docs: 1, amounts: [1000] } }],
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
  };

  return <TransactionsModal {...props} />;
}

describe('TransactionsModal wizard', () => {
  it('renders a navigable stepper tied to txWizardStep', () => {
    render(<WizardHarness initialStep="upload" />);

    const stepper = screen.getByRole('navigation', { name: /pasos del flujo de transacciones/i });
    expect(stepper).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /2\. evidencias/i })).toHaveAttribute('aria-current', 'step');
    expect(screen.getByTestId('tx-evidence-step')).toBeInTheDocument();
  });

  it('navigates to analyst when evidence exists and step 3 is enabled', async () => {
    render(<WizardHarness initialStep="upload" />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /3\. resumen/i }));
    });

    await waitFor(() => {
      expect(screen.getByTestId('tx-analyst-step')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /3\. resumen/i })).toHaveAttribute('aria-current', 'step');
  });

  it('shows in-modal close confirmation instead of window.confirm while busy', () => {
    const onClose = jest.fn();
    const confirmSpy = jest.spyOn(window, 'confirm').mockImplementation(() => true);
    const product = buildProduct();
    render(
      <TransactionsModal
        isOpen
        onClose={onClose}
        txWizardStep="upload"
        setTxWizardStep={jest.fn()}
        activeBankProduct={product}
        transactionProductCards={[{ product, descriptor: { title: 'x', description: '', insights: [], themeColor: '#000' }, intel: { docs: 1, amounts: [1000] } }]}
        selectedProductId={product.id}
        selectTransactionProduct={jest.fn()}
        deleteTransactionProduct={jest.fn()}
        addTransactionProduct={jest.fn()}
        updateActiveProduct={jest.fn()}
        updateProductById={jest.fn()}
        transactionTaxonomyOverrides={[]}
        upsertTransactionTaxonomyOverride={jest.fn()}
        removeTransactionTaxonomyOverride={jest.fn()}
        simulateBankLogin={jest.fn(() => true)}
        onUploadStatement={jest.fn(async () => null)}
        documentsLoading
        transactionUploadError={null}
        saveTransactionProductForBatch={jest.fn(() => true)}
        savedProductIds={[]}
        maxProducts={7}
        maxEvidenceFilesPerProduct={25}
        productsCreatedTotal={1}
        creationNotice={null}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /cerrar panel de productos y transacciones/i }));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Análisis en curso' })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });
});
