'use client';

import React, {
  useCallback,
  useMemo,
  useRef,
  type ReactElement,
  type RefObject,
} from 'react';

import {
  PANEL_LOOP_SIDE_COPIES,
  useMobilePanelInfiniteLoop,
} from './hooks/use-mobile-panel-infinite-loop';

export type PanelCardItem = { key: string; node: ReactElement };

function cloneLoopCard(
  card: PanelCardItem,
  index: number,
  segment: string
) {
  const baseClass = (card.node.props as { className?: string }).className ?? '';
  return React.cloneElement(card.node as ReactElement<Record<string, unknown>>, {
    key: `${segment}-${card.key}-${index}`,
    'data-loop-segment': segment,
    'data-loop-origin': String(index),
    className: `${baseClass} mobile-loop-card`.trim(),
  });
}

/** Card immediately before profile when scrolling left (biblioteca in the default deck). */
export function resolveLeftNeighborOrigin(cards: PanelCardItem[]): number {
  const libraryIndex = cards.findIndex((card) => card.key === 'library');
  if (libraryIndex >= 0) return libraryIndex;
  return Math.max(0, cards.length - 2);
}

export function MobilePanelCompactCarousel(props: {
  cards: PanelCardItem[];
  gridRef: RefObject<HTMLDivElement | null>;
  resetKey: number;
}) {
  const loopGridRef = useRef<HTMLDivElement | null>(null);
  const sideCopies = PANEL_LOOP_SIDE_COPIES;

  const setGridRef = useCallback(
    (node: HTMLDivElement | null) => {
      loopGridRef.current = node;
      if (props.gridRef) {
        (props.gridRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }
    },
    [props.gridRef]
  );

  const leftNeighborOrigin = useMemo(
    () => resolveLeftNeighborOrigin(props.cards),
    [props.cards]
  );

  const rendered = useMemo(() => {
    const segments: ReactElement[] = [];

    for (let copy = sideCopies; copy >= 1; copy -= 1) {
      props.cards.forEach((card, index) => {
        segments.push(cloneLoopCard(card, index, `prepend-${copy}`));
      });
    }

    props.cards.forEach((card, index) => {
      segments.push(cloneLoopCard(card, index, 'real'));
    });

    for (let copy = 1; copy <= sideCopies; copy += 1) {
      props.cards.forEach((card, index) => {
        segments.push(cloneLoopCard(card, index, `append-${copy}`));
      });
    }

    return segments;
  }, [props.cards, sideCopies]);

  useMobilePanelInfiniteLoop({
    panelGridRef: loopGridRef,
    cardCount: props.cards.length,
    leftNeighborOrigin,
    profileOrigin: 0,
    sideCopies,
    resetKey: props.resetKey,
  });

  return (
    <div ref={setGridRef} className="panel-grid is-infinite-loop">
      {rendered}
    </div>
  );
}
