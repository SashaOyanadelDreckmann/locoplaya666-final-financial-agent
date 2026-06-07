/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';

describe('budget pro mobile css safeguards', () => {
  const mobileCssPath = path.join(process.cwd(), 'app', 'agent-modals-budget-mobile.css');
  const mobileCss = fs.readFileSync(mobileCssPath, 'utf8');

  it('defines authoritative budget-table-pro column mapping on mobile', () => {
    expect(mobileCss).toContain('.budget-modal.is-mobile-shell .budget-table.budget-table-pro tbody td:nth-child(4)');
    expect(mobileCss).toContain('grid-area: cadence !important;');
    expect(mobileCss).toContain('.budget-modal.is-mobile-shell .budget-table.budget-table-pro tbody td:nth-child(8)');
    expect(mobileCss).toContain('grid-area: actions !important;');
    expect(mobileCss).toContain('content: attr(data-label) !important;');
    expect(mobileCss).toContain('text-overflow: ellipsis !important;');
  });

  it('locks budget modal page scroll on mobile and keeps table-wrap as the scroll host', () => {
    expect(mobileCss).toContain('BUDGET MODAL — MOBILE SHELL CONTRACT');
    expect(mobileCss).toContain('.agent-modal-overlay.budget-modal-overlay');
    expect(mobileCss).toContain('overflow: hidden !important');
    expect(mobileCss).toContain('.budget-table-scroll-host .budget-table-wrap');
    expect(mobileCss).toContain('overflow-y: auto !important');
    expect(mobileCss).toContain('touch-action: pan-y !important');
  });

  it('keeps compact cockpit and assistant internal scroll on mobile shell', () => {
    expect(mobileCss).toContain('.budget-cockpit-banner.is-compact');
    expect(mobileCss).toContain('.budget-main-carousel.mode-agent-front .budget-assistant-panel .bcc-hero');
    expect(mobileCss).toContain('overflow-y: auto !important');
  });
});
