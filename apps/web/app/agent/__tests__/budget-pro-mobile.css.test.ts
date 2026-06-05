/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';

describe('budget pro mobile css safeguards', () => {
  it('keeps cadence/actions mapping stable for budget-table-pro on mobile', () => {
    const cssPath = path.join(process.cwd(), 'app', 'agent.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    expect(css).toContain('/* Budget pro strict mobile mapping: avoid legacy 4-column action remap. */');
    expect(css).toContain('.budget-modal .budget-table.budget-table-pro tbody td:nth-child(4)');
    expect(css).toContain('grid-area: cadence !important;');
    expect(css).toContain('.budget-modal .budget-table.budget-table-pro tbody td:nth-child(8)');
    expect(css).toContain('grid-area: actions !important;');
    expect(css).toContain('.budget-modal .budget-cockpit-metrics');
    expect(css).toContain('.budget-modal .budget-main-carousel:not(.is-desktop) .budget-intel-kpis');
    expect(css).toContain('text-overflow: ellipsis !important;');
  });
});
