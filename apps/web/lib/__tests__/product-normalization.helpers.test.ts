import { normalizeProductAssistantState } from '../compartido/product-normalization.helpers';

describe('product-normalization.helpers', () => {
  it('clears legacy video upload format from assistant state', () => {
    const assistant = normalizeProductAssistantState({
      uploadFormat: 'video' as never,
      messages: [],
      summaryText: null,
      summaryModel: null,
      summaryGeneratedAt: null,
      summaryRegenerationsUsed: 0,
      lastSummaryFeedback: null,
    });

    expect(assistant.uploadFormat).toBeNull();
  });
});
