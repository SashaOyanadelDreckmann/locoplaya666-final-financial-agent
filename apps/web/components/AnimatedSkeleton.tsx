'use client';

import { motion } from 'framer-motion';

interface AnimatedSkeletonProps {
  count?: number;
  type?: 'card' | 'text' | 'circle' | 'rect';
  height?: string;
  width?: string;
  className?: string;
  animated?: boolean;
}

/**
 * Skeleton loading states with shimmer animations
 * Features:
 * - Multiple skeleton types
 * - Shimmer effect
 * - Customizable sizes
 */
export function AnimatedSkeleton({
  count = 1,
  type = 'card',
  height = '100px',
  width = '100%',
  className = '',
  animated = true,
}: AnimatedSkeletonProps) {
  const skeletons = Array.from({ length: count }, (_, i) => i);

  const renderSkeleton = (index: number) => {
    const baseClass = 'skeleton-loading';
    const animatedClass = animated ? 'animate-pulse' : '';

    switch (type) {
      case 'circle':
        return (
          <motion.div
            key={index}
            className={`${baseClass} ${animatedClass} rounded-full`}
            style={{ width: height, height }}
          />
        );

      case 'text':
        return (
          <motion.div key={index} className="space-y-2">
            <div
              className={`${baseClass} ${animatedClass} h-4 w-3/4 rounded`}
            />
            <div
              className={`${baseClass} ${animatedClass} h-4 w-5/6 rounded`}
            />
            <div
              className={`${baseClass} ${animatedClass} h-4 w-2/3 rounded`}
            />
          </motion.div>
        );

      case 'rect':
        return (
          <motion.div
            key={index}
            className={`${baseClass} ${animatedClass} rounded`}
            style={{ height, width }}
          />
        );

      case 'card':
      default:
        return (
          <motion.div
            key={index}
            className={`${baseClass} ${animatedClass} rounded-lg p-4 space-y-4`}
            style={{ height, width }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: index * 0.1 }}
          >
            {/* Card header */}
            <div className="flex items-center gap-4">
              <div className={`${baseClass} h-10 w-10 rounded-full`} />
              <div className="flex-1 space-y-2">
                <div className={`${baseClass} h-4 w-3/4 rounded`} />
                <div className={`${baseClass} h-3 w-1/2 rounded`} />
              </div>
            </div>

            {/* Card content */}
            <div className="space-y-2">
              <div className={`${baseClass} h-4 w-full rounded`} />
              <div className={`${baseClass} h-4 w-5/6 rounded`} />
            </div>
          </motion.div>
        );
    }
  };

  return (
    <div className={`skeleton-container space-y-4 ${className}`}>
      {skeletons.map((index) => renderSkeleton(index))}
    </div>
  );
}

/**
 * Loading spinner component
 */
export function LoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeMap = {
    sm: '20px',
    md: '32px',
    lg: '48px',
  };

  return (
    <motion.div
      animate={{ rotate: 360 }}
      transition={{
        duration: 1,
        repeat: Infinity,
        ease: 'linear',
      }}
      style={{
        width: sizeMap[size],
        height: sizeMap[size],
        border: `3px solid var(--border)`,
        borderTop: `3px solid var(--accent)`,
        borderRadius: '50%',
      }}
    />
  );
}

/**
 * Floating loading dots animation
 */
export function TypingIndicator() {
  const dots = [0, 1, 2];

  return (
    <div className="flex items-center gap-1">
      {dots.map((i) => (
        <motion.span
          key={i}
          className="typing-dot"
          animate={{
            y: [0, -10, 0],
            opacity: [0.5, 1, 0.5],
          }}
          transition={{
            duration: 1.4,
            repeat: Infinity,
            delay: i * 0.2,
          }}
        />
      ))}
    </div>
  );
}
