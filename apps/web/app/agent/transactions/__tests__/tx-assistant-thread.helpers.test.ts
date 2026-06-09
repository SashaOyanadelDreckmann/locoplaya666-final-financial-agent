/** @jest-environment node */

import {
  resolveAssistantMessageThread,
  selectAssistantMessagesForThread,
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
});
