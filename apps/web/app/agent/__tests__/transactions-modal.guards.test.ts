/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';

describe('transactions modal safeguards', () => {
  it('keeps a11y focus guards and upload limits in place', () => {
    const sourcePath = path.join(process.cwd(), 'app', 'agent', 'modals.tsx');
    const source = fs.readFileSync(sourcePath, 'utf8');

    expect(source).toContain('const TX_MAX_SINGLE_FILE_BYTES = 10 * 1024 * 1024;');
    expect(source).toContain('const TX_MAX_TOTAL_FILE_BYTES = 35 * 1024 * 1024;');
    expect(source).toContain('const transactionsModalRef = useRef<HTMLDivElement | null>(null);');
    expect(source).toContain("if (event.key !== 'Tab') return;");
    expect(source).toContain('aria-describedby="transactions-modal-intro"');
    expect(source).toContain('tabIndex={-1}');
    expect(source).toContain('tx-batch-recommendation-banner" role="status" aria-live="polite"');
    expect(source).toContain('Productos y transacciones');
    expect(source).toContain('const requestClose = useCallback');
    expect(source).toContain('countProductsWithAnalyzedMovements');
  });
});
