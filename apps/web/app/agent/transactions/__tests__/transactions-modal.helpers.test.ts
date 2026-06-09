/** @jest-environment node */

import { parsedDocumentsHaveTableSignals } from '../transactions-modal.helpers';

describe('parsedDocumentsHaveTableSignals', () => {
  it('detects structured parser modes and tables', () => {
    expect(
      parsedDocumentsHaveTableSignals([
        {
          structuredData: {
            parserMeta: { mode: 'exact_sheet' },
            tables: [],
          },
        },
      ]),
    ).toBe(true);
    expect(
      parsedDocumentsHaveTableSignals([
        {
          structuredData: {
            parserMeta: { mode: 'pdf_vision', confidence: 0.6 },
            tables: [],
          },
        },
      ]),
    ).toBe(false);
  });
});
