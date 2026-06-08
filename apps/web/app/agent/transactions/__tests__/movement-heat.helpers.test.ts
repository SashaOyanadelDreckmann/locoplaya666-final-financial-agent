import {
  maxMovementHeatAmount,
  movementRowHeatClass,
  movementTableRowHeatStyle,
} from '../transactions-modal.helpers';

describe('movement table heat helpers', () => {
  it('normalizes max amount with floor of 1', () => {
    expect(maxMovementHeatAmount([])).toBe(1);
    expect(maxMovementHeatAmount([0, -0])).toBe(1);
    expect(maxMovementHeatAmount([12_000, 450_000, 89_000])).toBe(450_000);
  });

  it('maps higher expense amounts to stronger red alpha', () => {
    const low = movementTableRowHeatStyle(10_000, 'expense', 100_000)['--row-bg'];
    const high = movementTableRowHeatStyle(100_000, 'expense', 100_000)['--row-bg'];
    expect(low).toMatch(/rgba\(118,\s*26,\s*36,/);
    expect(high).toMatch(/rgba\(118,\s*26,\s*36,/);
    const lowAlpha = Number(low.match(/,\s*([\d.]+)\)$/)?.[1] ?? 0);
    const highAlpha = Number(high.match(/,\s*([\d.]+)\)$/)?.[1] ?? 0);
    expect(highAlpha).toBeGreaterThan(lowAlpha);
  });

  it('maps higher income amounts to stronger green alpha', () => {
    const low = movementTableRowHeatStyle(5_000, 'income', 50_000)['--row-bg'];
    const high = movementTableRowHeatStyle(50_000, 'income', 50_000)['--row-bg'];
    expect(low).toMatch(/rgba\(62,\s*84,\s*22,/);
    expect(high).toMatch(/rgba\(62,\s*84,\s*22,/);
    const lowAlpha = Number(low.match(/,\s*([\d.]+)\)$/)?.[1] ?? 0);
    const highAlpha = Number(high.match(/,\s*([\d.]+)\)$/)?.[1] ?? 0);
    expect(highAlpha).toBeGreaterThan(lowAlpha);
  });

  it('exposes row class tokens for income and expense', () => {
    expect(movementRowHeatClass('income')).toBe('tx-row-income');
    expect(movementRowHeatClass('expense')).toBe('tx-row-expense');
  });
});
