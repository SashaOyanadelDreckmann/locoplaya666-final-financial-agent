/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';

describe('budget modal logic guards', () => {
  const modalsPath = path.join(process.cwd(), 'app', 'agent', 'modals.tsx');
  const source = fs.readFileSync(modalsPath, 'utf8');

  it('keeps desktop->mobile mode fallback to prevent invalid mode 3 on mobile', () => {
    expect(source).toContain('window.innerWidth >= 1024');
    expect(source).toContain("if (!desktop) setBudgetViewMode((prev) => (prev === 3 ? 2 : prev));");
  });

  it('auto-applies budget template when modal opens with empty rows', () => {
    expect(source).toContain('const templateAppliedRef = useRef(false);');
    expect(source).toContain('if (props.budgetRows.length > 0 || templateAppliedRef.current) return;');
    expect(source).toContain('props.applyBudgetTemplate();');
  });
});
