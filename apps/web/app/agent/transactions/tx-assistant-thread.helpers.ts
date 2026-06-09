import type { TxAssistantMessage, TxWizardStep } from './types';

export type TxAssistantThread = 'evidence' | 'summary';

export function resolveAssistantMessageThread(params: {
  txWizardStep: TxWizardStep;
  analysisAlreadyDone: boolean;
}): TxAssistantThread {
  if (params.txWizardStep === 'dashboard' && params.analysisAlreadyDone) return 'summary';
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
