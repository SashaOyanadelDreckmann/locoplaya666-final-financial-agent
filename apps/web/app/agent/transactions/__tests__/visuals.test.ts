import { libraryCardSurface, matteLibraryCardSurface, productVisualPalette } from '../visuals';

describe('transactions visuals', () => {
  it('builds a stable matte library card surface from the product palette', () => {
    const palette = productVisualPalette('prod-1-cuenta-banco');
    const surface = libraryCardSurface(palette);

    expect(surface.background).toContain(palette.base);
    expect(surface.borderColor).toBeTruthy();
    expect(surface.boxShadow).toContain('inset');
    expect(surface.tint).toBe(palette.tint);
  });

  it('builds opaque matte surfaces from stack palette colors', () => {
    const surface = matteLibraryCardSurface('#3b5068', '#8ea7bf');

    expect(surface.background).toContain('#3b5068');
    expect(surface.background).toContain('color-mix');
    expect(surface.tint).toBe('#8ea7bf');
  });
});
