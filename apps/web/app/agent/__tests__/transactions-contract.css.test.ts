/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';

describe('transactions modal layout contract css', () => {
  const contractPath = path.join(process.cwd(), 'app', 'agent-modals-transactions-contract.css');
  const modalsPath = path.join(process.cwd(), 'app', 'agent-modals.css');
  const contractCss = fs.readFileSync(contractPath, 'utf8');
  const modalsCss = fs.readFileSync(modalsPath, 'utf8');

  it('loads contract css last in agent-modals.css', () => {
    const imports = [...modalsCss.matchAll(/@import\s+'\.\/([^']+)'/g)].map((match) => match[1]);
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
    expect(contractCss).toContain('.transactions-modal .tx-flow-status-card');
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
});
