/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';

describe('modal mobile fullscreen css', () => {
  const fullscreenCssPath = path.join(
    process.cwd(),
    'app',
    'estilos',
    'modales',
    'comunes',
    'agent-modals-mobile-fullscreen.css',
  );
  const fullscreenCss = fs.readFileSync(fullscreenCssPath, 'utf8');
  const layoutCss = fs.readFileSync(path.join(process.cwd(), 'app', 'layout.tsx'), 'utf8');

  it('loads mobile fullscreen contract before header contract in layout', () => {
    expect(layoutCss).toContain("import './estilos/modales/comunes/agent-modals-mobile-fullscreen.css';");
    const imports = [...layoutCss.matchAll(/import\s+'\.\/([^']+\.css)'/g)].map((match) => match[1]);
    const fullscreenIdx = imports.indexOf('estilos/modales/comunes/agent-modals-mobile-fullscreen.css');
    const headerIdx = imports.indexOf('estilos/modales/comunes/agent-modals-header-contract.css');
    expect(fullscreenIdx).toBeGreaterThanOrEqual(0);
    expect(headerIdx).toBe(fullscreenIdx + 1);
  });

  it('fills overlay height and removes bottom vh caps on mobile shells', () => {
    expect(fullscreenCss).toContain('MOBILE MODAL FULLSCREEN');
    expect(fullscreenCss).toContain('padding-bottom: 0 !important');
    expect(fullscreenCss).toContain('height: 100dvh !important');
    expect(fullscreenCss).toContain('height: 100% !important');
    expect(fullscreenCss).toContain('max-height: 100% !important');
    expect(fullscreenCss).toContain('min-height: 0 !important');
    expect(fullscreenCss).toContain('.transactions-modal');
    expect(fullscreenCss).toContain('.budget-modal');
    expect(fullscreenCss).toContain('.interview-modal');
    expect(fullscreenCss).toContain('.transactions-modal .tx-scroll-body');
    expect(fullscreenCss).toContain('max-height: none !important');
    expect(fullscreenCss).toContain('overflow-y: auto !important');
  });
});
