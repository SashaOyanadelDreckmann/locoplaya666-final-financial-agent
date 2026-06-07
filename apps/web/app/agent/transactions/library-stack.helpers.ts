import { PRODUCT_STACK_PALETTE } from './constants';

export type LibraryStackLayer = {
  x: number;
  y: number;
  rotate: number;
  scale: number;
};

export const LIBRARY_STACK_LAYERS: readonly LibraryStackLayer[] = [
  { x: 4, y: -4, rotate: -2.6, scale: 1 },
  { x: -24, y: 16, rotate: -8.4, scale: 0.962 },
  { x: 28, y: 22, rotate: 7.1, scale: 0.924 },
  { x: -14, y: 34, rotate: -5.2, scale: 0.886 },
] as const;

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

export function libraryStackLayer(stackIndex: number): LibraryStackLayer {
  return LIBRARY_STACK_LAYERS[stackIndex % LIBRARY_STACK_LAYERS.length] ?? LIBRARY_STACK_LAYERS[0];
}
