'use client';

import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { MotionValue } from 'framer-motion';

import NumbersCanvas, { type MousePos } from './NumbersCanvas';

/**
 * Renders the fixed canvas + grain on document.body so they stay viewport-locked
 * on mobile (fixed inside overflow scroll containers breaks on iOS Safari).
 */
export default function HomeBackdropPortal({
  progress,
  mouseRef,
  featureDip,
}: {
  progress: MotionValue<number>;
  mouseRef: React.RefObject<MousePos>;
  featureDip?: MotionValue<number>;
}) {
  const [mounted, setMounted] = useState(false);

  useLayoutEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <>
      <div className="home-canvas-layer">
        <NumbersCanvas progress={progress} mouseRef={mouseRef} featureDip={featureDip} />
      </div>
      <div aria-hidden className="home-grain-layer" />
    </>,
    document.body,
  );
}
