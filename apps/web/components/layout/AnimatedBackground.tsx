'use client';

import { PremiumBackground } from './PremiumBackground';

export function AnimatedBackground() {
  return (
    <>
      <PremiumBackground />
      <div aria-hidden className="animated-background" />
    </>
  );
}
