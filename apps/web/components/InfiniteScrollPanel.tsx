'use client';

import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

interface InfiniteScrollPanelProps {
  children: React.ReactNode;
  autoScrollSpeed?: number; // pixels per second
  pauseOnHover?: boolean;
  enableAutoScroll?: boolean;
  className?: string;
}

/**
 * Mobile-optimized infinite scroll panel with auto-scroll and manual drag support
 * Features:
 * - Smooth auto-scroll that shows all cards
 * - User can still drag/swipe manually
 * - Pauses on hover/interaction
 * - Touch-optimized with -webkit-overflow-scrolling
 */
export function InfiniteScrollPanel({
  children,
  autoScrollSpeed = 40, // pixels per second
  pauseOnHover = true,
  enableAutoScroll = true,
  className = '',
}: InfiniteScrollPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isHovering, setIsHovering] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-scroll effect
  useEffect(() => {
    if (!enableAutoScroll || !containerRef.current) return;
    if (pauseOnHover && isHovering) return;
    if (isScrolling) return;

    const container = containerRef.current;
    const scrollStep = autoScrollSpeed / 60; // 60fps

    const autoScroll = () => {
      if (container) {
        container.scrollLeft += scrollStep;

        // Reset to beginning when reaching end
        if (
          container.scrollLeft >=
          container.scrollWidth - container.clientWidth - 10
        ) {
          container.scrollLeft = 0;
        }
      }
    };

    scrollIntervalRef.current = setInterval(autoScroll, 1000 / 60);

    return () => {
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current);
      }
    };
  }, [isHovering, isScrolling, autoScrollSpeed, pauseOnHover, enableAutoScroll]);

  const handleMouseDown = () => setIsScrolling(true);
  const handleMouseUp = () => setIsScrolling(false);
  const handleMouseEnter = () => pauseOnHover && setIsHovering(true);
  const handleMouseLeave = () => pauseOnHover && setIsHovering(false);
  const handleTouchStart = () => setIsScrolling(true);
  const handleTouchEnd = () => setIsScrolling(false);

  return (
    <motion.div
      ref={containerRef}
      className={`infinite-scroll-panel ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      {children}
    </motion.div>
  );
}

// Add this to your CSS file (e.g., agent.css)
// .infinite-scroll-panel {
//   display: flex;
//   overflow-x: auto;
//   scroll-snap-type: x mandatory;
//   -webkit-overflow-scrolling: touch;
//   gap: 8px;
//   padding: 8px;
//   scroll-behavior: smooth;
// }
//
// .infinite-scroll-panel > * {
//   scroll-snap-align: start;
//   scroll-snap-stop: always;
//   flex: 0 0 auto;
//   min-width: min(72vw, 240px);
// }
