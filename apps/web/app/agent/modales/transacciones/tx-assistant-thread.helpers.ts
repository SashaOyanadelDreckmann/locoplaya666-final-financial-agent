import type { TxAssistantMessage, TxWizardStep } from './types';

export type TxAssistantThread = 'evidence' | 'summary';

export function isSummaryAnalysisChatStep(params: {
  txWizardStep: TxWizardStep;
  analysisAlreadyDone: boolean;
}): boolean {
  return params.txWizardStep === 'dashboard' && params.analysisAlreadyDone;
}

export function isEvidenceUploadOnlyStep(txWizardStep: TxWizardStep): boolean {
  return txWizardStep === 'upload';
}

export function resolveAssistantMessageThread(params: {
  txWizardStep: TxWizardStep;
  analysisAlreadyDone: boolean;
}): TxAssistantThread {
  if (isSummaryAnalysisChatStep(params)) return 'summary';
  return 'evidence';
}

export function selectAssistantMessagesForThread(
  messages: TxAssistantMessage[],
  thread: TxAssistantThread,
): TxAssistantMessage[] {
  if (thread === 'summary') {
    return messages.filter((message) => message.thread === 'summary');
  }
  return messages.filter((message) => message.thread !== 'summary');
}
