/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';

describe('budget pro mobile css safeguards', () => {
  const mobileCssPath = path.join(process.cwd(), 'app', 'agent-modals-budget-mobile.css');
  const mobileCss = fs.readFileSync(mobileCssPath, 'utf8');

  it('defines authoritative budget-table-pro column mapping on mobile', () => {
    expect(mobileCss).toContain('.budget-modal.is-mobile-shell .budget-table.budget-table-pro tbody td:nth-child(8)');
    expect(mobileCss).toContain('grid-area: impact !important;');
    expect(mobileCss).toContain('.budget-row-delete.is-mobile');
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

  it('hides cockpit on mobile shell and resets table-front carousel layout', () => {
    expect(mobileCss).toContain('.budget-modal.is-mobile-shell .budget-cockpit-banner');
    expect(mobileCss).toContain('display: none !important');
    expect(mobileCss).toContain('.budget-main-carousel.mode-table-front:not(.is-desktop) > .budget-card-table');
    expect(mobileCss).toContain('transform: none !important');
    expect(mobileCss).toContain('flex: 1 1 auto !important');
    expect(mobileCss).toContain('height: 100% !important');
  });

  it('keeps assistant internal scroll on mobile shell', () => {
    expect(mobileCss).toContain('.budget-main-carousel.mode-agent-front .budget-assistant-panel .bcc-hero');
    expect(mobileCss).toContain('backdrop-filter: blur(20px)');
    expect(mobileCss).toContain('Diagnostics reset');
  });

  it('uses one-row scroll snap viewport on mobile table tab', () => {
    expect(mobileCss).toContain('--budget-mobile-row-slot');
    expect(mobileCss).toContain('scroll-snap-type: y mandatory');
    expect(mobileCss).toContain('scroll-snap-align: start');
    expect(mobileCss).toContain('is-mobile-row-card');
    expect(mobileCss).toContain('grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)');
    expect(mobileCss).toContain('.budget-chat-sync-button:not(.is-assistant-action)');
    expect(mobileCss).toContain('display: none !important');
  });

  it('loads authoritative budget mobile css last in layout', () => {
    const layoutCss = fs.readFileSync(path.join(process.cwd(), 'app', 'layout.tsx'), 'utf8');
    expect(layoutCss).toContain("import './agent-modals-budget-mobile-authoritative.css';");
  });

  it('blurs assistant backdrop table on mobile without hiding live updates', () => {
    const authCssPath = path.join(process.cwd(), 'app', 'agent-modals-budget-mobile-authoritative.css');
    const authCss = fs.readFileSync(authCssPath, 'utf8');
    expect(authCss).toContain('is-mobile-table-compact');
    expect(authCss).toContain('filter: blur(10px)');
    expect(authCss).toContain('display: none !important');
  });
});
