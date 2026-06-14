import { PRODUCT_STACK_PALETTE } from './constants';

export function assignUniquePaletteIndices(ids: string[]): number[] {
  const paletteLength = PRODUCT_STACK_PALETTE.length;
  const used = new Set<number>();

  return ids.map((id) => {
    let hash = 0;
    for (let i = 0; i < id.length; i += 1) {
      hash = (hash << 5) - hash + id.charCodeAt(i);
    }

    let index = Math.abs(hash) % paletteLength;
    for (let step = 0; step < paletteLength && used.has(index); step += 1) {
      index = (index + 1) % paletteLength;
    }

    used.add(index);
    return index;
  });
}
