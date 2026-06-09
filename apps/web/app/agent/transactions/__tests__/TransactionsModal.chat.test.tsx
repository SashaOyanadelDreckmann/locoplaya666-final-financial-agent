/** @jest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react';
import { useMemo, useState } from 'react';
import { TransactionsModal } from '../TransactionsModal';
import type { BankProduct, TransactionsModalProps } from '../types';

jest.mock('@/components/agent/ModalNumbersCanvas', () => ({
  __esModule: true,
  default: () => null,
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

function buildProduct(
  id: string,
  label: string,
  messages: NonNullable<BankProduct['assistant']>['messages'] = [],
  options?: { parsedDocuments?: BankProduct['parsedDocuments'] },
): BankProduct {
  return {
    id,
    label,
    bank: 'Banco de Chile (simulacion)',
    assistant: {
      messages,
      uploadFormat: null,
      summaryText: null,
      summaryModel: null,
      summaryGeneratedAt: null,
      summaryRegenerationsUsed: 0,
      lastSummaryFeedback: null,
    },
    productType: 'checking_account',
    simulationAccepted: true,
    connected: true,
    randomMode: false,
    uploadedFiles: [],
    parsedDocuments: options?.parsedDocuments ?? [{ name: 'cartola.pdf', text: 'movimiento 1000' }],
  };
}

function buildProps(products: BankProduct[], selectedId: string): TransactionsModalProps {
  const cards = products.map((product) => ({
    product,
    descriptor: buildDescriptor(product.label),
    intel: { docs: 0, amounts: [] as number[] },
  }));

  return {
    isOpen: true,
    onClose: jest.fn(),
    txWizardStep: 'upload',
    setTxWizardStep: jest.fn(),
    activeBankProduct: products.find((product) => product.id === selectedId) ?? null,
    transactionProductCards: cards,
    selectedProductId: selectedId,
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
    productsCreatedTotal: products.length,
    creationNotice: null,
  };
}

function SwitchableChatHarness() {
  const products = useMemo(
    () => [
      buildProduct('prod-a', 'Cuenta A', [
        {
          id: 'msg-a',
          role: 'assistant',
          text: 'Hola desde cuenta A',
          createdAt: new Date().toISOString(),
        },
      ]),
      buildProduct('prod-b', 'Cuenta B', [
        {
          id: 'msg-b',
          role: 'assistant',
          text: 'Hola desde cuenta B',
          createdAt: new Date().toISOString(),
        },
      ]),
    ],
    [],
  );
  const [selectedId, setSelectedId] = useState('prod-a');

  return (
    <>
      <button type="button" onClick={() => setSelectedId('prod-a')}>
        Seleccionar A
      </button>
      <button type="button" onClick={() => setSelectedId('prod-b')}>
        Seleccionar B
      </button>
      <TransactionsModal
        {...buildProps(products, selectedId)}
        activeBankProduct={products.find((product) => product.id === selectedId) ?? null}
        selectedProductId={selectedId}
        selectTransactionProduct={setSelectedId}
      />
    </>
  );
}

describe('TransactionsModal chat isolation', () => {
  it('shows the active product chat thread and product context bar', () => {
    const productA = buildProduct('prod-a', 'Cuenta A', [
      {
        id: 'msg-a',
        role: 'assistant',
        text: 'Hola desde cuenta A',
        createdAt: new Date().toISOString(),
      },
    ]);

    render(<TransactionsModal {...buildProps([productA], 'prod-a')} />);

    expect(screen.getByLabelText(/producto activo del chat/i)).toHaveTextContent('Cuenta A');
    expect(screen.getByText('Hola desde cuenta A')).toBeInTheDocument();
  });

  it('shows only the selected product conversation when switching products', () => {
    render(<SwitchableChatHarness />);

    expect(screen.getByText('Hola desde cuenta A')).toBeInTheDocument();
    expect(screen.queryByText('Hola desde cuenta B')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar B' }));

    expect(screen.getByText('Hola desde cuenta B')).toBeInTheDocument();
    expect(screen.queryByText('Hola desde cuenta A')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/producto activo del chat/i)).toHaveTextContent('Cuenta B');
  });

  it('keeps separate upload composer drafts per product while switching', () => {
    function SwitchableUploadHarness() {
      const products = useMemo(
        () => [
          buildProduct('prod-a', 'Cuenta A', [], { parsedDocuments: [] }),
          buildProduct('prod-b', 'Cuenta B', [], { parsedDocuments: [] }),
        ],
        [],
      );
      const [selectedId, setSelectedId] = useState('prod-a');

      return (
        <>
          <button type="button" onClick={() => setSelectedId('prod-a')}>
            Seleccionar A
          </button>
          <button type="button" onClick={() => setSelectedId('prod-b')}>
            Seleccionar B
          </button>
          <TransactionsModal
            {...buildProps(products, selectedId)}
            activeBankProduct={products.find((product) => product.id === selectedId) ?? null}
            selectedProductId={selectedId}
            selectTransactionProduct={setSelectedId}
          />
        </>
      );
    }

    render(<SwitchableUploadHarness />);

    const composer = screen.getByLabelText(/mensaje del chat de subida de evidencia/i) as HTMLTextAreaElement;

    fireEvent.change(composer, { target: { value: 'borrador A' } });
    expect(composer.value).toBe('borrador A');

    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar B' }));
    fireEvent.change(screen.getByLabelText(/mensaje del chat de subida de evidencia/i), {
      target: { value: 'borrador B' },
    });
    expect((screen.getByLabelText(/mensaje del chat de subida de evidencia/i) as HTMLTextAreaElement).value).toBe(
      'borrador B',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar A' }));
    expect((screen.getByLabelText(/mensaje del chat de subida de evidencia/i) as HTMLTextAreaElement).value).toBe(
      'borrador A',
    );
  });
});
