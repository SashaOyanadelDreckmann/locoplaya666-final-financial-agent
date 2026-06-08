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
    onRefineSummary: jest.fn(),
    onGoToAnalyst: jest.fn(),
    onRegenerateSummary: jest.fn(),
    ...overrides,
  };
}

describe('TxEvidenceStep', () => {
  it('renders unified composer with attach control and format chips', () => {
    render(<TxEvidenceStep {...buildProps()} />);

    expect(screen.getByLabelText(/adjuntar archivos/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/mensaje del chat de transacciones/i)).toBeInTheDocument();
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

    const composer = screen.getByLabelText(/mensaje del chat de transacciones/i);
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

    const composer = screen.getByLabelText(/mensaje del chat de transacciones/i);
    fireEvent.keyDown(composer, { key: 'Enter', shiftKey: true });
    expect(onAssistantSend).not.toHaveBeenCalled();
  });

  it('hides attach when analysis is already done', () => {
    render(
      <TxEvidenceStep
        {...buildProps({
          analysisAlreadyDone: true,
          activeBankProduct: {
            ...buildProduct(),
            parsedDocuments: [{ name: 'cartola.pdf', text: 'mov' }],
          },
        })}
      />,
    );

    expect(screen.queryByLabelText(/adjuntar archivos/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rápido' })).not.toBeInTheDocument();
  });
});
