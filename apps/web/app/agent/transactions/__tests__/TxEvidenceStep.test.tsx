/** @jest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react';
import { TxEvidenceStep } from '../TxEvidenceStep';
import type { BankProduct } from '../types';

function buildProduct(): BankProduct {
  return {
    id: 'prod-1',
    label: 'Cuenta corriente',
    bank: 'Banco de Chile (simulacion)',
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
    simulationAccepted: true,
    connected: true,
    randomMode: false,
    uploadedFiles: [],
    parsedDocuments: [],
  };
}

function buildProps(overrides: Partial<Parameters<typeof TxEvidenceStep>[0]> = {}) {
  return {
    activeBankProduct: buildProduct(),
    maxEvidenceFilesPerProduct: 25,
    summaryRegenerationsLeft: 3,
    transitionPulse: 0,
    dockTransitionPhase: 'idle',
    currentStage: 'evidence',
    scrollRef: { current: null },
    assistantMessages: [],
    analysisAlreadyDone: false,
    txUploadOnboardingStep: 'upload' as const,
    selectedUploadFormat: null,
    pendingEvidenceFiles: [],
    txAssistantInput: '',
    txAssistantLoading: false,
    documentsLoading: false,
    summaryText: null,
    summaryGeneratedAt: null,
    summaryModel: null,
    processingModeLabel: 'Procesando evidencia',
    processingMetaLabel: 'OCR',
    processingPrimaryCopy: 'Leyendo archivos',
    txAssistantError: null,
    onPatchUploadFormat: jest.fn(),
    onResetUploadFormat: jest.fn(),
    onSetUploadOnboardingStep: jest.fn(),
    onBumpTransitionPulse: jest.fn(),
    onAppendPendingEvidence: jest.fn(),
    onAssistantInputChange: jest.fn(),
    onAssistantSend: jest.fn(),
    onGoToAnalyst: jest.fn(),
    onRegenerateSummary: jest.fn(),
    ...overrides,
  };
}

describe('TxEvidenceStep', () => {
  it('renders unified composer with attach control and format chips', () => {
    render(<TxEvidenceStep {...buildProps()} />);

    expect(screen.getByLabelText(/adjuntar archivos/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/mensaje del chat de subida de evidencia/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rápido' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'PDF' })).toBeInTheDocument();
  });

  it('sends on Enter without Shift', () => {
    const onAssistantSend = jest.fn();
    render(
      <TxEvidenceStep
        {...buildProps({
          txAssistantInput: 'hola',
          onAssistantSend,
        })}
      />,
    );

    const composer = screen.getByLabelText(/mensaje del chat de subida de evidencia/i);
    fireEvent.keyDown(composer, { key: 'Enter' });
    expect(onAssistantSend).toHaveBeenCalledTimes(1);
  });

  it('does not send on Shift+Enter', () => {
    const onAssistantSend = jest.fn();
    render(
      <TxEvidenceStep
        {...buildProps({
          txAssistantInput: 'hola',
          onAssistantSend,
        })}
      />,
    );

    const composer = screen.getByLabelText(/mensaje del chat de subida de evidencia/i);
    fireEvent.keyDown(composer, { key: 'Enter', shiftKey: true });
    expect(onAssistantSend).not.toHaveBeenCalled();
  });

  it('hides stale errors while documents are loading', () => {
    render(
      <TxEvidenceStep
        {...buildProps({
          transactionUploadError: 'Error viejo',
          documentsLoading: true,
        })}
      />,
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders informational notices separately from errors', () => {
    render(
      <TxEvidenceStep
        {...buildProps({
          txAssistantNotice: 'Detectamos Excel / CSV en tus archivos.',
          txAssistantError: 'Error real',
        })}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent(/detectamos excel/i);
    expect(screen.getByRole('alert')).toHaveTextContent(/error real/i);
  });

  it('uses format-specific accept when a format is selected', () => {
    const { container } = render(
      <TxEvidenceStep
        {...buildProps({
          selectedUploadFormat: 'spreadsheet',
        })}
      />,
    );

    const input = container.querySelector('input[type="file"]');
    expect(input).toHaveAttribute('accept', expect.stringContaining('.xlsx'));
    expect(input?.getAttribute('accept')).not.toContain('image/*');
  });

  it('hides upload composer when analysis is already done', () => {
    render(
      <TxEvidenceStep
        {...buildProps({
          analysisAlreadyDone: true,
          summaryText: 'Resumen listo para revisar.',
          activeBankProduct: {
            ...buildProduct(),
            parsedDocuments: [{ name: 'cartola.pdf', text: 'mov' }],
          },
        })}
      />,
    );

    expect(screen.queryByLabelText(/adjuntar archivos/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/mensaje del chat de subida de evidencia/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continuar al resumen/i })).toBeInTheDocument();
  });
});
