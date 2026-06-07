import { libraryCardSurface, productVisualPalette } from '../visuals';

describe('transactions visuals', () => {
  it('builds a stable library card surface from the product palette', () => {
    const palette = productVisualPalette('prod-1-cuenta-banco');
    const surface = libraryCardSurface(palette);

    expect(surface.background).toContain(palette.glow);
    expect(surface.background).toContain(palette.base);
    expect(surface.borderColor).toBe(palette.edge);
    expect(surface.boxShadow).toContain('inset');
  });
});
