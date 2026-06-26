/** @jest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react';
import type { BankProduct } from '../types';

jest.mock('../tx-evidence-scroll.helpers', () => ({
  revealTransactionsEvidenceContinueStep: jest.fn(),
}));

jest.mock('@/lib/interfaz/use-section-scroll-progress', () => ({
  useNarrowViewport: jest.fn(() => false),
}));

jest.mock('../use-prefers-reduced-motion', () => ({
  usePrefersReducedMotion: () => false,
}));

import { TxEvidenceStep } from '../TxEvidenceStep';
import { revealTransactionsEvidenceContinueStep } from '../tx-evidence-scroll.helpers';

const { useNarrowViewport } = jest.requireMock('@/lib/interfaz/use-section-scroll-progress') as {
  useNarrowViewport: jest.Mock;
};

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
    scrollRef: { current: null },
    assistantMessages: [],
    analysisAlreadyDone: false,
    txUploadOnboardingStep: 'upload' as const,
    selectedUploadFormat: null,
    pendingEvidenceFiles: [],
    txAssistantInput: '',
    txAssistantLoading: false,
    documentsLoading: false,
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
    ...overrides,
  };
}

describe('TxEvidenceStep', () => {
  beforeEach(() => {
    useNarrowViewport.mockReturnValue(false);
    jest.restoreAllMocks();
  });

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
          activeBankProduct: {
            ...buildProduct(),
            assistant: {
              ...buildProduct().assistant!,
              summaryText: 'Panorama del periodo con diez movimientos.',
            },
            parsedDocuments: [{ name: 'cartola.pdf', text: 'mov' }],
          },
        })}
      />,
    );

    expect(screen.queryByLabelText(/adjuntar archivos/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/mensaje del chat de subida de evidencia/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/resumen listo/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/panorama del periodo/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continuar al resumen/i })).toBeInTheDocument();
  });

  it('scrolls to the continue composer on mobile after selecting a format', () => {
    jest.useFakeTimers();
    useNarrowViewport.mockReturnValue(true);
    const revealSpy = revealTransactionsEvidenceContinueStep as jest.Mock;
    revealSpy.mockClear();
    const onPatchUploadFormat = jest.fn();
    const onSetUploadOnboardingStep = jest.fn();

    render(
      <TxEvidenceStep
        {...buildProps({
          onPatchUploadFormat,
          onSetUploadOnboardingStep,
        })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'PDF' }));

    expect(onPatchUploadFormat).toHaveBeenCalledWith('pdf');
    expect(onSetUploadOnboardingStep).toHaveBeenCalledWith('details');

    jest.runAllTimers();
    expect(revealSpy).toHaveBeenCalled();

    jest.useRealTimers();
  });

  it('shows mobile continue cue after a format is selected', () => {
    useNarrowViewport.mockReturnValue(true);

    render(
      <TxEvidenceStep
        {...buildProps({
          selectedUploadFormat: 'pdf',
          txUploadOnboardingStep: 'details',
        })}
      />,
    );

    expect(screen.getByText(/sigue abajo: adjunta tu archivo/i)).toBeInTheDocument();
  });

  it('shows photo format examples below guidance when photos format is selected', () => {
    render(
      <TxEvidenceStep
        {...buildProps({
          selectedUploadFormat: 'photos',
          txUploadOnboardingStep: 'details',
        })}
      />,
    );

    expect(screen.getByRole('button', { name: /ver ejemplo/i })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: /ejemplos de capturas/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /ver ejemplo/i }));

    expect(screen.getByRole('list', { name: /ejemplos de capturas/i })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getByRole('img', { name: /listado de movimientos agrupados por fecha/i })).toHaveAttribute(
      'src',
      '/transacciones/ejemplos-fotos/movimientos-ejemplo-1.png',
    );
  });

  it('does not show photo format examples for non-photo formats', () => {
    render(
      <TxEvidenceStep
        {...buildProps({
          selectedUploadFormat: 'pdf',
          txUploadOnboardingStep: 'details',
        })}
      />,
    );

    expect(screen.queryByRole('button', { name: /ver ejemplo/i })).not.toBeInTheDocument();
  });
});
