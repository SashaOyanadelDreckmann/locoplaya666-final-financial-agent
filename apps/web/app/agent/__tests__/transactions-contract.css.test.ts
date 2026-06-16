/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';

describe('transactions modal layout contract css', () => {
  const contractPath = path.join(process.cwd(), 'app', 'estilos', 'modales', 'transacciones', 'agent-modals-transactions-contract.css');
  const layoutPath = path.join(process.cwd(), 'app', 'layout.tsx');
  const contractCss = fs.readFileSync(contractPath, 'utf8');
  const layoutSource = fs.readFileSync(layoutPath, 'utf8');

  it('loads transactions contract css in layout.tsx after shared modal guards', () => {
    const imports = [...layoutSource.matchAll(/import\s+'\.\/([^']+\.css)'/g)].map((match) => match[1]);
    const txContractIndex = imports.indexOf('estilos/modales/transacciones/agent-modals-transactions-contract.css');
    const desktopGuardIndex = imports.indexOf('estilos/modales/comunes/agent-modals-desktop-guard.css');
    const closeConfirmIndex = imports.indexOf('estilos/modales/comunes/agent-modals-close-confirm.css');

    expect(txContractIndex).toBeGreaterThan(-1);
    expect(txContractIndex).toBeGreaterThan(desktopGuardIndex);
    expect(closeConfirmIndex).toBe(imports.length - 1);
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
    expect(contractCss).toContain('align-items: stretch !important');
    expect(contractCss).toContain('.transactions-modal .tx-wizard-stepper-item');
    expect(contractCss).toContain('.transactions-modal .tx-wizard-step-copy');
    expect(contractCss).toContain('display: none !important');
    expect(contractCss).not.toContain('.transactions-modal .tx-flow-status-card');
  });

  it('prevents workspace scroll clipping on executive actions', () => {
    expect(contractCss).toContain('.transactions-modal .pt-right.tx-panel-surface--workspace .tx-ex-regen-btn');
    expect(contractCss).toContain('min-height: 36px !important');
    expect(contractCss).toContain('WORKSPACE LAYOUT');
    expect(contractCss).toContain('min-height: auto !important');
    expect(contractCss).toContain('overflow-y: auto !important');
    expect(contractCss).toContain('padding-bottom: calc(20px + env(safe-area-inset-bottom, 0px)) !important');
  });

  it('defines workspace footer clearance for analyst actions', () => {
    expect(contractCss).toContain('padding-bottom: 0 !important');
    expect(contractCss).toContain('min-height: 132px !important');
  });

  it('locks mobile library card layout and premium palette', () => {
    expect(contractCss).toContain('.transactions-modal .tx-scanner-lib-card.tx-lib-card');
    expect(contractCss).toContain('var(--tx-lib-inline-bg)');
    expect(contractCss).toContain('-webkit-line-clamp: 2 !important');
    expect(contractCss).toContain('.transactions-modal .pt-left.tx-panel-surface--library');
    expect(contractCss).toContain('--tx-panel-library-border');
    expect(contractCss).toContain('background: #ffffff !important');
    expect(contractCss).toContain('.transactions-modal .tx-scanner-stream-root.is-quiet');
    expect(contractCss).toContain('touch-action: none !important');
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

  it('flattens workspace executive summary without nested card chrome', () => {
    expect(contractCss).toContain('.tx-ex-summary');
    expect(contractCss).toContain('Workspace executive summary — flat on panel gradient');
    expect(contractCss).toContain('.tx-ex-actions');
    expect(contractCss).not.toMatch(
      /\.tx-ap-chat-dock,\s*\n\.transactions-modal[^\n]*\.tx-ex-kpi/s,
    );
  });

  it('flattens workspace merchant quality without nested card chrome', () => {
    expect(contractCss).toContain('Workspace merchant quality — flat on panel gradient');
    expect(contractCss).toContain('.tx-merchant-quality-row');
  });

  it('flattens workspace charts without nested card chrome', () => {
    expect(contractCss).toContain('Workspace charts — flat on panel gradient');
    expect(contractCss).toContain('.tx-ap-chart-block');
    expect(contractCss).not.toContain('.tx-ap-chart-card');
  });

  it('flattens workspace movement tables with premium light editorial styling', () => {
    expect(contractCss).toContain('Workspace movement tables — flat premium editorial');
    expect(contractCss).toContain('.tx-movements-table--pro thead tr');
    expect(contractCss).toContain('.tx-movement-detail-text');
    expect(contractCss).toContain('var(--tx-contract-eyebrow)');
  });

  it('keeps minimal summary charts visible on mobile scroll hosts', () => {
    expect(contractCss).toContain('.tx-summary-charts-grid');
    expect(contractCss).toContain(':has(.tx-minimal-summary-shell)');
    expect(contractCss).toContain('.recharts-responsive-container');
    expect(contractCss).toContain('min-height: 220px !important');
  });

  it('uses dark copy on empty-state white pills', () => {
    expect(contractCss).toContain('--tx-empty-pill-text: #1a1f28');
    expect(contractCss).toContain('.pt-empty-state .pt-empty-item strong');
    expect(contractCss).toContain('.pt-empty-state .pt-empty-item span');
    expect(contractCss).toMatch(
      /\.pt-empty-state \.pt-empty-item strong[\s\S]*color: var\(--tx-empty-pill-text\)/,
    );
  });

  it('restyles chat and analysis loading with beige workspace palette', () => {
    expect(contractCss).toContain('Chat / analysis loading — beige workspace palette');
    expect(contractCss).toContain('--tx-loading-surface-bg');
    expect(contractCss).toContain('.transactions-modal .tx-analyst-pending-shell');
    expect(contractCss).toContain('.transactions-modal .tx-minimal-chat-thread .tx-analysis-live');
    expect(contractCss).toContain('background-color: #f7f2ea !important');
    expect(contractCss).toMatch(
      /\.transactions-modal \.tx-analysis-badge[\s\S]*color: var\(--tx-loading-text\)/,
    );
  });
});
