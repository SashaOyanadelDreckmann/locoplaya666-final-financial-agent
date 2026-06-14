/** @jest-environment jsdom */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useMemo, useState } from 'react';
import { TransactionsModal } from '../TransactionsModal';
import type { BankProduct, TransactionsModalProps, TxWizardStep } from '../types';

jest.mock('@/components/agente/ModalNumbersCanvas', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../TxEvidenceStep', () => ({
  TxEvidenceStep: () => <div data-testid="tx-evidence-step">Evidencias</div>,
}));

jest.mock('../TxAnalystDashboard', () => ({
  TxAnalystDashboard: () => <div data-testid="tx-analyst-step">Resumen</div>,
}));

function buildDescriptor(title: string): TransactionsModalProps['transactionProductCards'][number]['descriptor'] {
  return {
    title,
    description: '',
    insights: [],
    themeColor: '#0f172a',
  };
}

function buildProduct(overrides: Partial<BankProduct> = {}): BankProduct {
  return {
    id: 'prod-test-1',
    label: 'Producto 1',
    bank: '',
    assistant: {
      messages: [],
      uploadFormat: null,
      summaryText: null,
      summaryModel: null,
      summaryGeneratedAt: null,
      summaryRegenerationsUsed: 0,
      lastSummaryFeedback: null,
    },
    productType: 'checking_account',
    simulationAccepted: false,
    connected: false,
    randomMode: false,
    uploadedFiles: [],
    parsedDocuments: [],
    ...overrides,
  };
}

function buildBaseProps(overrides: Partial<TransactionsModalProps> = {}): TransactionsModalProps {
  const product = buildProduct();
  return {
    isOpen: true,
    onClose: jest.fn(),
    txWizardStep: 'credentials',
    setTxWizardStep: jest.fn(),
    activeBankProduct: product,
    transactionProductCards: [{ product, descriptor: buildDescriptor('draft'), intel: { docs: 0, amounts: [] } }],
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
    ...overrides,
  };
}

function TransactionsModalHarness({
  initialProps,
}: {
  initialProps?: Partial<TransactionsModalProps>;
}) {
  const [product, setProduct] = useState(buildProduct());
  const [txWizardStep, setTxWizardStep] = useState<TxWizardStep>('credentials');
  const [transactionUploadError, setTransactionUploadError] = useState<string | null>(null);
  const transactionProductCards = useMemo(
    () => [{ product, descriptor: buildDescriptor('draft'), intel: { docs: 0, amounts: [] } }],
    [product],
  );

  const props = buildBaseProps({
    activeBankProduct: product,
    transactionProductCards,
    txWizardStep,
    setTxWizardStep,
    transactionUploadError,
    updateActiveProduct: (patch) => {
      setProduct((current) => ({ ...current, ...patch }));
    },
    simulateBankLogin: (config) => {
      const bank = config?.bank;
      const label = config?.label;
      if (!bank || !label || !config.simulationAccepted) {
        setTransactionUploadError('Completa consentimiento simulado para autorizar.');
        return false;
      }
      setProduct((current) => ({
        ...current,
        bank,
        label,
        productType: config.productType ?? current.productType,
        simulationAccepted: true,
        connected: true,
      }));
      setTransactionUploadError(null);
      setTxWizardStep('upload');
      return true;
    },
    ...initialProps,
  });

  return <TransactionsModal {...props} />;
}

describe('TransactionsModal consent UX', () => {
  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('shows actionable guidance while authorization prerequisites are missing', () => {
    render(<TransactionsModalHarness />);

    expect(
      screen.getByText('Completa institución, plantilla de producto, consentimiento simulado para autorizar.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Autorizar y continuar' })).toBeDisabled();
  });

  it('reveals the authorized product in the library as soon as authorization succeeds', async () => {
    render(<TransactionsModalHarness />);

    fireEvent.change(screen.getAllByRole('textbox')[0], {
      target: { value: 'Banco de Chile (simulacion)' },
    });
    fireEvent.change(screen.getAllByRole('textbox')[1], {
      target: { value: 'Cuenta corriente' },
    });
    fireEvent.click(screen.getByRole('checkbox'));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Autorizar y continuar' }));
    });

    await waitFor(() => {
      expect(screen.queryByText('Biblioteca vacía')).not.toBeInTheDocument();
    });

    const library = document.querySelector('.pt-list');
    expect(library).not.toBeNull();
    expect(library).toHaveTextContent('Cuenta corriente');
    expect(library).toHaveTextContent('Autorizado');
  });

  it('authorizes and advances to evidence when the form is complete', async () => {
    render(<TransactionsModalHarness />);

    fireEvent.change(screen.getAllByRole('textbox')[0], {
      target: { value: 'Banco de Chile (simulacion)' },
    });
    fireEvent.change(screen.getAllByRole('textbox')[1], {
      target: { value: 'Cuenta corriente' },
    });
    fireEvent.click(screen.getByRole('checkbox'));

    const continueButton = screen.getByRole('button', { name: 'Autorizar y continuar' });
    expect(continueButton).not.toBeDisabled();

    await act(async () => {
      fireEvent.click(continueButton);
      jest.advanceTimersByTime(2000);
    });

    await waitFor(() => {
      expect(screen.getByTestId('tx-evidence-step')).toBeInTheDocument();
    });
    expect(screen.getByRole('dialog')).toHaveAttribute('data-stage', 'evidence');
  });

  it('stays on consent and surfaces errors when authorization fails', async () => {
    render(
      <TransactionsModalHarness
        initialProps={{
          simulateBankLogin: () => false,
          transactionUploadError: 'Completa consentimiento simulado para autorizar.',
        }}
      />,
    );

    fireEvent.change(screen.getAllByRole('textbox')[0], {
      target: { value: 'BancoEstado (simulacion)' },
    });
    fireEvent.change(screen.getAllByRole('textbox')[1], {
      target: { value: 'Cuenta vista' },
    });
    fireEvent.click(screen.getByRole('checkbox'));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Autorizar y continuar' }));
      jest.advanceTimersByTime(1500);
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('consentimiento simulado');
      expect(screen.queryByTestId('tx-evidence-step')).not.toBeInTheDocument();
    });
  });
});
