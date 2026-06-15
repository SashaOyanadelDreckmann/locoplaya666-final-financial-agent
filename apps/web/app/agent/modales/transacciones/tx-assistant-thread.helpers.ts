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
    return selectSummaryChatMessages(messages);
  }
  return messages.filter((message) => message.thread !== 'summary');
}

/** Last user upload turn on the evidence thread (user message through trailing assistant replies). */
export function pickEvidenceUploadHandshake(messages: TxAssistantMessage[]): TxAssistantMessage[] {
  const evidence = messages.filter((message) => message.thread !== 'summary');
  if (evidence.length === 0) return [];

  let lastUserIdx = -1;
  for (let index = evidence.length - 1; index >= 0; index -= 1) {
    if (evidence[index]?.role === 'user') {
      lastUserIdx = index;
      break;
    }
  }
  if (lastUserIdx < 0) return [];
  return evidence.slice(lastUserIdx);
}

/** Summary chat: explicit summary thread, with evidence upload handshake as fallback. */
export function selectSummaryChatMessages(messages: TxAssistantMessage[]): TxAssistantMessage[] {
  const summary = messages.filter((message) => message.thread === 'summary');
  const handshake = pickEvidenceUploadHandshake(messages);

  if (summary.length === 0) return handshake;

  const hasSummaryUser = summary.some((message) => message.role === 'user');
  if (!hasSummaryUser) {
    const uploadUser = handshake.find((message) => message.role === 'user');
    if (uploadUser) return [uploadUser, ...summary];
  }

  return summary;
}

export function buildSummaryChatTurnAppend(
  priorMessages: TxAssistantMessage[],
  assistantText: string,
): TxAssistantMessage[] {
  const toAppend: TxAssistantMessage[] = [];
  const hasSummaryUser = priorMessages.some((message) => message.thread === 'summary' && message.role === 'user');

  if (!hasSummaryUser) {
    const uploadUser = pickEvidenceUploadHandshake(priorMessages).find((message) => message.role === 'user');
    if (uploadUser) {
      toAppend.push({
        ...uploadUser,
        id: `${Date.now()}-summary-user-seed`,
        thread: 'summary',
      });
    }
  }

  toAppend.push({
    id: `${Date.now()}-assistant-summary`,
    role: 'assistant',
    thread: 'summary',
    text: assistantText,
    createdAt: new Date().toISOString(),
  });

  return toAppend;
}
