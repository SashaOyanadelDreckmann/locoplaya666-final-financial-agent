'use client';

import { useEffect, useState } from 'react';

/**
 * Premium background component
 * Handles dark mode backgrounds for non-home pages
 */
export function PremiumBackground() {
  const [, setImageLoaded] = useState(false);

  useEffect(() => {
    // Only load image if we're not on the home page
    // Home page has its own gradient background
    setImageLoaded(false);
  }, []);

  return (
    <>
      {/* Dark background for non-home pages */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: -2,
          background: 'linear-gradient(135deg, #0f1419 0%, #1a2332 100%)',
          pointerEvents: 'none',
        }}
      />
    </>
  );
}
