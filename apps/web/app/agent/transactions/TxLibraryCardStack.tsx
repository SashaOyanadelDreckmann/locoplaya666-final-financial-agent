'use client';

import { useMemo } from 'react';
import {
  PRODUCT_STACK_PALETTE,
  PRODUCT_STACK_TEXT_PALETTE,
} from './constants';
import { NumericDust } from './presentation';
import { assignUniquePaletteIndices } from './library-stack.helpers';
import type { BankProduct } from './types';
import { matteLibraryCardSurface } from './visuals';
import { ScannerCardStream } from '@/components/ui/scanner-card-stream';

type LibraryCardEntry = {
  product: BankProduct;
  intel: { docs: number; amounts: number[] };
};

type TxLibraryCardStackProps = {
  cards: LibraryCardEntry[];
  productCarouselIndex: number;
  recentlyDockedProductId: string | null;
  prefersReducedMotion: boolean;
  transitionPulse: number;
  onSelectAt: (index: number) => void;
  onDelete: (productId: string) => void;
};

export function TxLibraryCardStack({
  cards,
  productCarouselIndex,
  recentlyDockedProductId,
  prefersReducedMotion,
  transitionPulse,
  onSelectAt,
  onDelete,
}: TxLibraryCardStackProps) {
  const paletteIndices = useMemo(
    () => assignUniquePaletteIndices(cards.map(({ product }) => product.id)),
    [cards],
  );

  const focusedPaletteIndex = paletteIndices[productCarouselIndex] ?? productCarouselIndex;
  const focusedCardColor = PRODUCT_STACK_PALETTE[focusedPaletteIndex] ?? PRODUCT_STACK_PALETTE[0];
  const focusedCardAccent =
    PRODUCT_STACK_TEXT_PALETTE[focusedPaletteIndex] ?? PRODUCT_STACK_TEXT_PALETTE[0];

  const streamItems = useMemo(
    () =>
      cards.map((entry, stackIndex) => {
        const paletteIndex = paletteIndices[stackIndex] ?? stackIndex;
        const color = PRODUCT_STACK_PALETTE[paletteIndex];
        const textAccent = PRODUCT_STACK_TEXT_PALETTE[paletteIndex];
        const cardSurface = matteLibraryCardSurface(color, textAccent);
        return {
          ...entry,
          id: entry.product.id,
          surfaceStyle: {
            '--tx-lib-card-surface': cardSurface.background,
            '--tx-lib-card-edge': cardSurface.borderColor,
            '--tx-lib-card-shadow': cardSurface.boxShadow,
            '--pt-stack-bg': color,
          },
        };
      }),
    [cards, paletteIndices],
  );

  return (
    <div
      className="tx-library-stack-block"
      style={{
        ['--tx-lib-nav-accent' as string]: focusedCardColor,
        ['--tx-lib-nav-accent-edge' as string]: focusedCardAccent,
      }}
    >
      <ScannerCardStream
        items={streamItems}
        activeIndex={productCarouselIndex}
        onActiveIndexChange={onSelectAt}
        prefersReducedMotion={prefersReducedMotion}
        quietMode
        cardWidthRatio={0.82}
        renderCard={(entry, stackIndex, isFocused) => {
          const { product, intel } = entry;
          const paletteIndex = paletteIndices[stackIndex] ?? stackIndex;
          const color = PRODUCT_STACK_PALETTE[paletteIndex];
          const textAccent = PRODUCT_STACK_TEXT_PALETTE[paletteIndex];
          const cardSurface = matteLibraryCardSurface(color, textAccent);

          return (
            <div
              className={`tx-scanner-lib-card tx-lib-card tx-lib-card-shell ${isFocused ? 'is-active is-top' : ''} ${recentlyDockedProductId === product.id ? 'tx-lib-enter' : ''}`}
              data-docked={recentlyDockedProductId === product.id ? 'true' : 'false'}
              data-stack-index={stackIndex}
              style={{
                ['--tx-lib-inline-bg' as string]: cardSurface.background,
                ['--tx-lib-inline-edge' as string]: cardSurface.borderColor,
                ['--tx-lib-inline-shadow' as string]: cardSurface.boxShadow,
                ['--pt-stack-color' as string]: color,
                ['--pt-stack-bg' as string]: color,
                ['--pt-stack-border' as string]: color,
                ['--pt-stack-accent' as string]: textAccent,
                ['--pt-stack-idx' as string]: String(stackIndex),
                ['--tx-lib-tint' as string]: cardSurface.tint,
              }}
            >
              {recentlyDockedProductId === product.id && !prefersReducedMotion ? (
                <NumericDust scope="library-card" pulse={transitionPulse} active count={14} />
              ) : null}
              <div className="tx-lib-card-matte-veil" aria-hidden="true" />
              <div className="pt-item-top tx-lib-card-top">
                <div className="tx-lib-card-copy">
                  <span className="tx-lib-card-eyebrow">
                    {product.productType === 'credit_card' ? 'Tarjeta autorizada' : 'Producto conectado'}
                  </span>
                  <span className="pt-item-name">{product.label}</span>
                </div>
                <span className="pt-item-status">{product.connected ? 'Autorizado' : 'Pendiente'}</span>
              </div>
              <span className="pt-item-bank">{product.bank || 'Institución por definir'}</span>
              <div className="pt-item-meta">
                <span>{intel.docs} respaldo(s)</span>
                <span>{intel.amounts.length} movimiento(s)</span>
              </div>
              <div className="tx-lib-card-chip" aria-hidden="true" />
              {isFocused ? (
                <button
                  type="button"
                  className="pt-item-delete-mini"
                  aria-label={`Eliminar ${product.label}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete(product.id);
                  }}
                >
                  ×
                </button>
              ) : null}
            </div>
          );
        }}
      />
    </div>
  );
}
