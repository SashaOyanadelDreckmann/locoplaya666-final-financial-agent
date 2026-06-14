import { assignUniquePaletteIndices } from '../library-stack.helpers';
import { PRODUCT_STACK_PALETTE } from '../constants';

describe('library stack helpers', () => {
  it('assigns unique palette indices for visible cards', () => {
    const indices = assignUniquePaletteIndices(['prod-a', 'prod-b', 'prod-c', 'prod-d']);

    expect(indices).toHaveLength(4);
    expect(new Set(indices).size).toBe(4);
    indices.forEach((index) => {
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(PRODUCT_STACK_PALETTE.length);
    });
  });
});
