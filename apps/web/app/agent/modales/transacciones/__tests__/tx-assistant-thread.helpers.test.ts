/** @jest-environment node */

import {
  buildSummaryChatTurnAppend,
  isSummaryAnalysisChatStep,
  resolveAssistantMessageThread,
  selectAssistantMessagesForThread,
  selectSummaryChatMessages,
} from '../tx-assistant-thread.helpers';
import type { TxAssistantMessage } from '../types';

function message(id: string, thread?: TxAssistantMessage['thread']): TxAssistantMessage {
  return {
    id,
    role: 'user',
    text: id,
    createdAt: new Date().toISOString(),
    thread,
  };
}

describe('tx-assistant-thread.helpers', () => {
  it('enables summary chat only on dashboard after analysis', () => {
    expect(isSummaryAnalysisChatStep({ txWizardStep: 'dashboard', analysisAlreadyDone: true })).toBe(true);
    expect(isSummaryAnalysisChatStep({ txWizardStep: 'upload', analysisAlreadyDone: true })).toBe(false);
    expect(isSummaryAnalysisChatStep({ txWizardStep: 'dashboard', analysisAlreadyDone: false })).toBe(false);
  });

  it('routes dashboard step to summary thread and upload step to evidence thread', () => {
    expect(
      resolveAssistantMessageThread({ txWizardStep: 'dashboard', analysisAlreadyDone: true }),
    ).toBe('summary');
    expect(
      resolveAssistantMessageThread({ txWizardStep: 'upload', analysisAlreadyDone: true }),
    ).toBe('evidence');
  });

  it('filters legacy messages into evidence and keeps summary chat isolated', () => {
    const messages = [
      message('legacy-1'),
      message('legacy-2', 'evidence'),
      message('summary-1', 'summary'),
    ];

    expect(selectAssistantMessagesForThread(messages, 'summary').map((item) => item.id)).toEqual(['summary-1']);
    expect(selectAssistantMessagesForThread(messages, 'evidence').map((item) => item.id)).toEqual([
      'legacy-1',
      'legacy-2',
    ]);
  });

  it('shows evidence upload handshake in summary chat when summary thread is empty', () => {
    const messages = [
      { ...message('upload-user', 'evidence'), role: 'user' as const, attachments: ['cartola.pdf'] },
      { ...message('upload-assistant', 'evidence'), role: 'assistant' as const },
    ];

    expect(selectSummaryChatMessages(messages).map((item) => item.id)).toEqual([
      'upload-user',
      'upload-assistant',
    ]);
  });

  it('prepends evidence upload user when summary chat only has assistant welcome', () => {
    const messages = [
      { ...message('upload-user', 'evidence'), role: 'user' as const, attachments: ['cartola.pdf'] },
      { ...message('welcome', 'summary'), role: 'assistant' as const },
    ];

    expect(selectSummaryChatMessages(messages).map((item) => item.id)).toEqual(['upload-user', 'welcome']);
  });

  it('seeds summary chat turn with upload user and assistant welcome', () => {
    const prior = [{ ...message('upload-user', 'evidence'), role: 'user' as const, attachments: ['cartola.pdf'] }];
    const appended = buildSummaryChatTurnAppend(prior, 'Listo.');

    expect(appended).toHaveLength(2);
    expect(appended[0]?.thread).toBe('summary');
    expect(appended[0]?.role).toBe('user');
    expect(appended[1]?.thread).toBe('summary');
    expect(appended[1]?.role).toBe('assistant');
    expect(appended[1]?.text).toBe('Listo.');
  });
});
