/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';

describe('budget pro mobile css safeguards', () => {
  const mobileCssPath = path.join(process.cwd(), 'app', 'estilos', 'modales', 'presupuesto', 'agent-modals-budget-mobile.css');
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

  it('uses one-row scroll viewport on mobile table tab', () => {
    const authCssPath = path.join(process.cwd(), 'app', 'estilos', 'modales', 'presupuesto', 'agent-modals-budget-mobile-authoritative.css');
    const authCss = fs.readFileSync(authCssPath, 'utf8');
    expect(authCss).toContain('--budget-mobile-row-slot');
    expect(authCss).toContain('height: auto !important');
    expect(mobileCss).toContain('is-mobile-row-card');
    expect(mobileCss).toContain('is-mobile-row-card');
    expect(mobileCss).toContain('mode-table-front:not(.is-desktop) .budget-table-section.is-mobile-table-compact .budget-table-bottom-actions');
    expect(mobileCss).toContain('mode-table-front:not(.is-desktop) > [data-budget-mobile-footer=\'true\']');
    expect(mobileCss).toContain('.budget-chat-sync-button:not(.is-assistant-action)');
    expect(mobileCss).toContain('display: none !important');
  });

  it('loads budget mobile authoritative and desktop guard before transactions contract', () => {
    const layoutCss = fs.readFileSync(path.join(process.cwd(), 'app', 'layout.tsx'), 'utf8');
    expect(layoutCss).toContain("import './estilos/modales/presupuesto/agent-modals-budget-mobile-authoritative.css';");
    expect(layoutCss).toContain("import './estilos/modales/presupuesto/agent-modals-budget-mobile-styles.css';");
    expect(layoutCss).toContain("import './estilos/modales/presupuesto/agent-modals-budget-desktop-guard.css';");
    const imports = [...layoutCss.matchAll(/import\s+'\.\/([^']+\.css)'/g)].map((match) => match[1]);
    const authIdx = imports.indexOf('estilos/modales/presupuesto/agent-modals-budget-mobile-authoritative.css');
    const stylesIdx = imports.indexOf('estilos/modales/presupuesto/agent-modals-budget-mobile-styles.css');
    const deskIdx = imports.indexOf('estilos/modales/presupuesto/agent-modals-budget-desktop-guard.css');
    const txIdx = imports.indexOf('estilos/modales/transacciones/agent-modals-transactions-contract.css');
    expect(authIdx).toBeGreaterThanOrEqual(0);
    expect(stylesIdx).toBeGreaterThan(authIdx);
    expect(deskIdx).toBeGreaterThan(stylesIdx);
    expect(txIdx).toBeGreaterThan(deskIdx);
  });

  it('locks desktop assistant hero to minimal panel-matched typewriter styles', () => {
    const deskCssPath = path.join(process.cwd(), 'app', 'estilos', 'modales', 'presupuesto', 'agent-modals-budget-desktop-guard.css');
    const deskCss = fs.readFileSync(deskCssPath, 'utf8');
    expect(deskCss).toContain('BUDGET DESKTOP — assistant hero (Apple minimal)');
    expect(deskCss).toContain('.bcc-hero-question--gradient-demo');
    expect(deskCss).toContain('.agent-keyword-gradient');
    expect(deskCss).toContain('--hero-keyword-a: #ecd060');
    expect(deskCss).toContain('.bcc-hero-compose');
    expect(deskCss).toContain('.budget-chat-sync-button.is-assistant-action');
    expect(deskCss).toContain('is-pending-confirm-action');
  });

  it('keeps desktop header and view nav compact and centered', () => {
    const deskCssPath = path.join(process.cwd(), 'app', 'estilos', 'modales', 'presupuesto', 'agent-modals-budget-desktop-guard.css');
    const deskCss = fs.readFileSync(deskCssPath, 'utf8');
    expect(deskCss).toContain('BUDGET DESKTOP — compact header + tabs stack');
    expect(deskCss).toContain('.budget-modal-header-stack');
    expect(deskCss).toContain('.budget-modal-header-title-row .budget-view-nav');
    expect(deskCss).toContain('grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) !important');
    expect(deskCss).toContain('BUDGET HEADER — transactions contract + yellow');
    expect(deskCss).toContain('BUDGET FOOTER — unified slim pill buttons');
    expect(deskCss).toContain('height: 30px !important');
  });

  it('fits split desktop table without horizontal clipping', () => {
    const deskCssPath = path.join(process.cwd(), 'app', 'estilos', 'modales', 'presupuesto', 'agent-modals-budget-desktop-guard.css');
    const deskCss = fs.readFileSync(deskCssPath, 'utf8');
    expect(deskCss).toContain('BUDGET DESKTOP — split: tabla compacta sin recorte');
    expect(deskCss).toContain('.mode-split .budget-table.budget-table-pro');
    expect(deskCss).toContain('table-layout: fixed !important');
    expect(deskCss).toContain('min-width: 0 !important');
    expect(deskCss).toContain('overflow-x: hidden !important');
  });

  it('blurs assistant backdrop table on mobile without hiding live updates', () => {
    const authCssPath = path.join(process.cwd(), 'app', 'estilos', 'modales', 'presupuesto', 'agent-modals-budget-mobile-authoritative.css');
    const authCss = fs.readFileSync(authCssPath, 'utf8');
    expect(authCss).toContain('is-mobile-table-compact');
    expect(authCss).toContain('filter: blur(10px)');
    expect(authCss).toContain('display: none !important');
  });

  it('keeps table footer visible and removes diagnostics phantom safe-area padding', () => {
    const authCssPath = path.join(process.cwd(), 'app', 'estilos', 'modales', 'presupuesto', 'agent-modals-budget-mobile-authoritative.css');
    const authCss = fs.readFileSync(authCssPath, 'utf8');
    expect(authCss).toContain('padding-bottom: 0 !important');
    expect(authCss).toContain('footer siempre visible');
    expect(authCss).toContain('visibility: visible !important');
    expect(authCss).toContain('margin: 22px 0 0 !important');
  });

  it('keeps cadence pills separated from payment and movement labels on mobile', () => {
    const authCssPath = path.join(process.cwd(), 'app', 'estilos', 'modales', 'presupuesto', 'agent-modals-budget-mobile-authoritative.css');
    const authCss = fs.readFileSync(authCssPath, 'utf8');
    expect(authCss).toContain('row-gap: 10px !important');
    expect(authCss).toContain("td[data-label='Recurrencia']");
    expect(authCss).toContain('padding-bottom: 6px !important');
    expect(authCss).toContain('tr.is-active-row .budget-pill-button');
    expect(authCss).toContain('height: 20px !important');
    expect(authCss).toContain('tr.is-mobile-row-card input');
    expect(authCss).toContain('height: 36px !important');
  });

  it('defines premium mobile themes for all budget table styles', () => {
    const stylesCssPath = path.join(process.cwd(), 'app', 'estilos', 'modales', 'presupuesto', 'agent-modals-budget-mobile-styles.css');
    const stylesCss = fs.readFileSync(stylesCssPath, 'utf8');
    expect(stylesCss).toContain('budget-mobile-intel-summary--midnight');
    expect(stylesCss).toContain('budget-table-style-ledger');
    expect(stylesCss).toContain('budget-table-style-atelier');
    expect(stylesCss).toContain('budget-table-style-terminal');
    expect(stylesCss).toContain('budget-table-style-carbon');
    expect(stylesCss).toContain('--mb-input-text');
    expect(stylesCss).toContain('--mb-label');
    expect(stylesCss).toContain('min-height: 20px !important');
    expect(stylesCss).toContain('budget-mobile-intel-summary--ledger');
    expect(stylesCss).toContain('background: transparent !important');
    expect(stylesCss).toContain('--mb-input-text, #1a1714');
    expect(stylesCss).toContain("data-budget-table-style='carbon'] .budget-pdf-surface.budget-table-style-carbon.is-mobile-compact");
    expect(stylesCss).toContain('background: #000000 !important');
  });

  it('keeps mobile assistant overlay aligned with desktop (sharp table + blur card)', () => {
    const guardCssPath = path.join(process.cwd(), 'app', 'estilos', 'modales', 'presupuesto', 'agent-modals-budget-desktop-guard.css');
    const guardCss = fs.readFileSync(guardCssPath, 'utf8');
    const source = fs.readFileSync(path.join(process.cwd(), 'app', 'agent', 'modales', 'presupuesto', 'BudgetModal.tsx'), 'utf8');
    const intelSource = fs.readFileSync(path.join(process.cwd(), 'components', 'ui', 'budget-intelligence-table.tsx'), 'utf8');
    expect(guardCss).toContain('BUDGET MOBILE — assistant overlay (desktop-like)');
    expect(guardCss).toContain('filter: none !important');
    expect(guardCss).toContain('budget-assistant-blur-veil');
    expect(guardCss).toContain('Mobile intel summary — match desktop title');
    expect(guardCss).toContain('is-budget-assistant-income');
    expect(source).toContain('BudgetMobileIntelSummary');
    expect(intelSource).toContain('Budget intelligence');
    expect(guardCss).toContain('is-budget-assistant-expense');
    expect(guardCss).toContain('is-budget-assistant-neutral');
    expect(guardCss).toContain('BUDGET — assistant keywords: olive / wine / mustard');
    expect(guardCss).toContain('--hero-keyword-a: #b8d088');
    expect(guardCss).toContain('--hero-keyword-a: #e8a8a8');
    expect(guardCss).toContain('--hero-keyword-a: #ecd060');
    expect(guardCss).toContain('.agent-keyword-gradient--s0');
    expect(guardCss).toContain('.agent-keyword-gradient--s1');
    expect(guardCss).toContain('.agent-keyword-gradient--s2');
    expect(guardCss).toContain('border-radius: 20px');
    expect(source).toContain('isMobileAssistantOverlay');
    expect(source).toContain('assistantToneClass={mobileAssistantHeroToneClass}');
    expect(source).toContain('budget-modal.assistant-tone');
  });

  it('keeps horizontal and vertical row swipe separate from view navigation on mobile', () => {
    const guardCssPath = path.join(process.cwd(), 'app', 'estilos', 'modales', 'presupuesto', 'agent-modals-budget-desktop-guard.css');
    const guardCss = fs.readFileSync(guardCssPath, 'utf8');
    const mobileCssPath = path.join(process.cwd(), 'app', 'estilos', 'modales', 'presupuesto', 'agent-modals-budget-mobile.css');
    const mobileCss = fs.readFileSync(mobileCssPath, 'utf8');
    const gestureSource = fs.readFileSync(
      path.join(process.cwd(), 'app', 'agent', 'modales', 'presupuesto', 'use-budget-mobile-row-gestures.ts'),
      'utf8',
    );
    const viewSwipeSource = fs.readFileSync(
      path.join(process.cwd(), 'app', 'agent', 'modales', 'presupuesto', 'use-budget-view-swipe.ts'),
      'utf8',
    );
    const modalSource = fs.readFileSync(
      path.join(process.cwd(), 'app', 'agent', 'modales', 'presupuesto', 'BudgetModal.tsx'),
      'utf8',
    );
    expect(guardCss).toContain('BUDGET MOBILE — row swipe (vertical + horizontal)');
    expect(guardCss).toContain('is-row-swipe-peek');
    expect(guardCss).toContain('is-row-swipe-releasing');
    expect(gestureSource).toContain('releaseHorizontalDrag');
    expect(gestureSource).toContain('dataset.budgetRowSlide');
    expect(gestureSource).toContain('is-row-swipe-dragging');
    expect(guardCss).toContain('--budget-row-swipe-x');
    expect(mobileCss).toContain('Mobile swipe between Asistente ↔ Tabla');
    expect(mobileCss).toContain('--budget-swipe-x');
    expect(viewSwipeSource).toContain('shouldSkipBudgetViewSwipeHost');
    expect(modalSource).toContain('useBudgetViewSwipe');
  });

  it('styles split desktop agent column with white surface and dark ink', () => {
    const guardCssPath = path.join(process.cwd(), 'app', 'estilos', 'modales', 'presupuesto', 'agent-modals-budget-desktop-guard.css');
    const guardCss = fs.readFileSync(guardCssPath, 'utf8');
    expect(guardCss).toContain('BUDGET DESKTOP — split: white agent column surface');
    expect(guardCss).toContain('.mode-split > .budget-card-agent.budget-assistant-panel{');
    expect(guardCss).toContain('background: #ffffff !important');
    expect(guardCss).toContain('--budget-split-agent-ink: #171411');
    expect(guardCss).toContain('EOF — assistant keywords: single palette (no rainbow)');
    expect(guardCss).toContain('background-image: none !important');
    expect(guardCss).toContain('.mode-split > .budget-card-agent.budget-assistant-panel .bcc-hero-input{');
  });

  it('keeps ledger mobile active row light (beats diagnostics dark td blocks)', () => {
    const guardCssPath = path.join(process.cwd(), 'app', 'estilos', 'modales', 'presupuesto', 'agent-modals-budget-desktop-guard.css');
    const guardCss = fs.readFileSync(guardCssPath, 'utf8');
    expect(guardCss).toContain('BUDGET MOBILE — ledger/editorial active row');
    expect(guardCss).toContain("data-budget-table-style='ledger'] .budget-pdf-surface.budget-table-style-ledger.is-mobile-compact:not(.is-budget-pdf-exporting) .budget-table.budget-table-pro tbody tr.is-mobile-row-card.is-active-row td");
    expect(guardCss).toContain('background: transparent !important');
    expect(guardCss).toContain('--mb-input-bg, rgba(255, 252, 246, 0.98)');
  });

  it('styles Fijo/Variable pills with olive income and pastel red expense', () => {
    const guardCssPath = path.join(process.cwd(), 'app', 'estilos', 'modales', 'presupuesto', 'agent-modals-budget-desktop-guard.css');
    const guardCss = fs.readFileSync(guardCssPath, 'utf8');
    expect(guardCss).toContain('BUDGET — Fijo / Variable pills (income / expense)');
    expect(guardCss).toContain('--budget-pill-income-fill: #b5c796');
    expect(guardCss).toContain('--budget-pill-expense-fill: #e2abab');
    expect(guardCss).toContain('.budget-pill-group.is-income .budget-pill-button.is-active');
    expect(guardCss).toContain('.budget-pill-group.is-expense .budget-pill-button.is-active');
  });
});
