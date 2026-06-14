/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';

describe('chat table scroll css contract', () => {
  const contractPath = path.join(process.cwd(), 'app', 'estilos', 'modales', 'transacciones', 'agent-modals-transactions-contract.css');
  const contractCss = fs.readFileSync(contractPath, 'utf8');

  it('keeps large chat tables inside a bidirectional scroll host', () => {
    expect(contractCss).toContain('CHAT THREAD TABLE SCROLL');
    expect(contractCss).toContain('.agent-thread .md-table-wrap');
    expect(contractCss).toContain('.agent-thread .agent-table-wrap');
    expect(contractCss).toContain('.chat-table-scroll-host');
    expect(contractCss).toContain('.chat-table-scroll-hint');
    expect(contractCss).toContain('overflow: auto !important');
    expect(contractCss).toContain('max-height: min(52vh, 480px) !important');
    expect(contractCss).toContain('touch-action: pan-x pan-y pinch-zoom !important');
    expect(contractCss).toContain('width: max-content !important');
    expect(contractCss).toContain('position: sticky !important');
    expect(contractCss).toContain('is-hint-visible');
  });
});
