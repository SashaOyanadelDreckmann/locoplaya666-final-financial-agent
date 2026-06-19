/** @jest-environment node */

import { CHAT_ATTACH_MAX_FILES, CHAT_ATTACH_MAX_TOTAL_BYTES } from '../services/chatAttachmentAnalysis.service';

describe('chatAttachmentAnalysis constants', () => {
  it('matches main chat composer limits', () => {
    expect(CHAT_ATTACH_MAX_FILES).toBe(5);
    expect(CHAT_ATTACH_MAX_TOTAL_BYTES).toBe(35 * 1024 * 1024);
  });
});
