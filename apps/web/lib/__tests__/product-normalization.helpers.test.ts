import { normalizeProductAssistantState } from '../product-normalization.helpers';

describe('product-normalization.helpers', () => {
  it('preserves video upload format in assistant state', () => {
    const assistant = normalizeProductAssistantState({
      uploadFormat: 'video',
      messages: [],
      summaryText: null,
      summaryModel: null,
      summaryGeneratedAt: null,
      summaryRegenerationsUsed: 0,
      lastSummaryFeedback: null,
    });

    expect(assistant.uploadFormat).toBe('video');
  });
});
