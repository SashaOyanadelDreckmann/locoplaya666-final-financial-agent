/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';

describe('transactions modal layout contract css', () => {
  const contractPath = path.join(process.cwd(), 'app', 'agent-modals-transactions-contract.css');
  const layoutPath = path.join(process.cwd(), 'app', 'layout.tsx');
  const contractCss = fs.readFileSync(contractPath, 'utf8');
  const layoutSource = fs.readFileSync(layoutPath, 'utf8');

  it('loads contract css last in layout.tsx styles', () => {
    const imports = [...layoutSource.matchAll(/import\s+'\.\/([^']+\.css)'/g)].map((match) => match[1]);
    expect(imports[imports.length - 1]).toBe('agent-modals-transactions-contract.css');
  });

  it('defines authoritative opaque panel and single scroll host', () => {
    expect(contractCss).toContain('TRANSACTIONS MODAL — AUTHORITATIVE LAYOUT CONTRACT');
    expect(contractCss).toContain('.transactions-modal .tx-scroll-body');
    expect(contractCss).toContain('overflow-y: auto !important');
    expect(contractCss).toContain('background: linear-gradient(180deg, var(--tx-contract-panel)');
  });

  it('keeps hero in-flow and content card at full column width', () => {
    expect(contractCss).toContain('.transactions-modal .tx-content-carousel .tx-3d-hero-shell');
    expect(contractCss).toContain('position: relative !important');
    expect(contractCss).toContain('.transactions-modal .tx-content-card');
    expect(contractCss).toContain('width: 100% !important');
    expect(contractCss).toContain('padding-top: 0 !important');
    expect(contractCss).toContain('.transactions-modal .tx-hero-shell-spacer');
    expect(contractCss).toContain('display: none !important');
  });

  it('styles tx-wizard-stepper and compact mobile stepper', () => {
    expect(contractCss).toContain('.transactions-modal .tx-wizard-stepper-list');
    expect(contractCss).toContain('.transactions-modal .tx-wizard-step-copy');
    expect(contractCss).toContain('display: none !important');
    expect(contractCss).not.toContain('.transactions-modal .tx-flow-status-card');
  });

  it('neutralizes phantom mobile bottom clearance', () => {
    expect(contractCss).toContain('padding-bottom: 0 !important');
    expect(contractCss).not.toContain('132px');
  });

  it('locks mobile library card layout and premium palette', () => {
    expect(contractCss).toContain('.transactions-modal .tx-lib-card-select');
    expect(contractCss).toContain('flex-direction: row !important');
    expect(contractCss).toContain('.transactions-modal .pt-item.pt-item-stack.tx-lib-card');
    expect(contractCss).toContain('var(--tx-lib-inline-bg)');
    expect(contractCss).toContain('min-height: 232px !important');
    expect(contractCss).toContain('-webkit-line-clamp: 2 !important');
  });

  it('fits mobile wizard stepper in one row without swipe', () => {
    expect(contractCss).toContain('grid-template-columns: repeat(3, minmax(0, 1fr)) !important');
    expect(contractCss).toContain('.transactions-modal .tx-wizard-step-idx');
    expect(contractCss).toContain('display: none !important');
  });

  it('locks mobile overlay scroll and fits format rail without swipe', () => {
    expect(contractCss).toContain('.agent-modal-overlay.transactions-modal-overlay');
    expect(contractCss).toContain('overflow-y: hidden !important');
    expect(contractCss).toContain('grid-template-columns: repeat(5, minmax(0, 1fr)) !important');
    expect(contractCss).toContain('.transactions-modal .tx-format-rail-chip-label-short');
  });

  it('forces single-column mobile stack with html-scoped EOF overrides', () => {
    expect(contractCss).toContain('html:not(.home-route-active) .transactions-modal .pt-shell');
    expect(contractCss).toContain('flex-direction: column !important');
    expect(contractCss).toContain('html:not(.home-route-active) .transactions-modal .pt-left');
    expect(contractCss).toContain('flex: 0 0 auto !important');
  });

  it('defines desktop guard for evidence header and library stack', () => {
    expect(contractCss).toContain('DESKTOP GUARD');
    expect(contractCss).toContain('@media (min-width: 1101px)');
    expect(contractCss).toContain('.transactions-modal .tx-content-card.tx-content-card--agent.is-main-center .tx-agent-stage-title');
    expect(contractCss).toContain("font-family: Georgia, 'Times New Roman', serif !important");
    expect(contractCss).toContain("font-family: 'Playfair Display', Georgia, serif !important");
    expect(contractCss).toContain('.transactions-modal .pt-left .pt-list');
    expect(contractCss).toContain('.transactions-modal .tx-format-rail-chip-label-short');
  });
});
