'use client';

import { useMemo, useState } from 'react';
import {
  PRODUCT_STACK_PALETTE,
  PRODUCT_STACK_TEXT_PALETTE,
} from './constants';
import { NumericDust } from './presentation';
import {
  assignUniquePaletteIndices,
  libraryStackLayer,
} from './library-stack.helpers';
import type { BankProduct } from './types';
import { matteLibraryCardSurface } from './visuals';

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
  const [peekProductId, setPeekProductId] = useState<string | null>(null);
  const visibleCards = cards.slice(0, 4);
  const paletteIndices = useMemo(
    () => assignUniquePaletteIndices(visibleCards.map(({ product }) => product.id)),
    [visibleCards],
  );

  return (
    <div className="tx-library-stack-block">
      <div className="pt-stack-carousel tx-library-is-saved tx-library-matte-stack">
        {visibleCards.map(({ product, intel }, stackIndex) => {
          const isTop = stackIndex === 0;
          const paletteIndex = paletteIndices[stackIndex] ?? stackIndex;
          const color = PRODUCT_STACK_PALETTE[paletteIndex];
          const textAccent = PRODUCT_STACK_TEXT_PALETTE[paletteIndex];
          const layer = libraryStackLayer(stackIndex);
          const cardSurface = matteLibraryCardSurface(color, textAccent);
          const isPeeking = peekProductId === product.id;

          return (
            <div
              key={product.id}
              className={`pt-item pt-item-stack tx-lib-card tx-lib-card-shell ${isTop ? 'is-active is-top' : ''} ${recentlyDockedProductId === product.id ? 'tx-lib-enter' : ''} ${isPeeking ? 'is-peek' : ''}`}
              data-docked={recentlyDockedProductId === product.id ? 'true' : 'false'}
              data-stack-index={stackIndex}
              onMouseEnter={() => setPeekProductId(product.id)}
              onMouseLeave={() => setPeekProductId((current) => (current === product.id ? null : current))}
              onTouchStart={() => setPeekProductId(product.id)}
              onTouchEnd={() => {
                window.setTimeout(() => {
                  setPeekProductId((current) => (current === product.id ? null : current));
                }, 220);
              }}
              onTouchCancel={() => {
                setPeekProductId((current) => (current === product.id ? null : current));
              }}
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
                ['--tx-stack-x' as string]: `${layer.x}px`,
                ['--tx-stack-y' as string]: `${layer.y}px`,
                ['--tx-stack-rotate' as string]: `${layer.rotate}deg`,
                ['--tx-stack-scale' as string]: String(layer.scale),
              }}
            >
              <button
                type="button"
                className="tx-lib-card-select"
                onClick={() => onSelectAt(productCarouselIndex + stackIndex)}
                aria-current={isTop ? 'true' : undefined}
                aria-label={`Seleccionar ${product.label}`}
              >
                {recentlyDockedProductId === product.id && !prefersReducedMotion ? (
                  <NumericDust scope="library-card" pulse={transitionPulse} active count={18} />
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
              </button>
              {isTop ? (
                <button
                  type="button"
                  className="pt-item-delete-mini"
                  aria-label={`Eliminar ${product.label}`}
                  onClick={() => onDelete(product.id)}
                >
                  ×
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      {cards.length > 1 ? (
        <div className="pt-stack-nav">
          <button
            type="button"
            className="continue-ghost"
            aria-label="Producto anterior"
            onClick={() => onSelectAt(productCarouselIndex - 1)}
          >
            ←
          </button>
          <span className="tx-lib-card-nav-status" aria-live="polite">
            {productCarouselIndex + 1} / {cards.length}
          </span>
          <button
            type="button"
            className="continue-ghost"
            aria-label="Producto siguiente"
            onClick={() => onSelectAt(productCarouselIndex + 1)}
          >
            →
          </button>
        </div>
      ) : null}
    </div>
  );
}
