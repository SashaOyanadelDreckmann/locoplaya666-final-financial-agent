'use client';

import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface StaggerContainerProps {
  children: ReactNode;
  staggerDelay?: number;
  delayChildren?: number;
  className?: string;
}

/**
 * Stagger animation container for lists and grid items
 * Automatically staggered animations for all children
 */
export function StaggerContainer({
  children,
  staggerDelay = 0.1,
  delayChildren = 0.2,
  className = '',
}: StaggerContainerProps) {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: staggerDelay,
        delayChildren,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.5,
        ease: [0.34, 1.56, 0.64, 1],
      },
    },
  };

  return (
    <motion.div
      className={className}
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Map through children and wrap with item variants */}
      {Array.isArray(children)
        ? children.map((child, index) => (
            <motion.div key={index} variants={itemVariants}>
              {child}
            </motion.div>
          ))
        : children}
    </motion.div>
  );
}

/**
 * List variant with horizontal/vertical options
 */
interface StaggerListProps {
  children: ReactNode[];
  direction?: 'vertical' | 'horizontal';
  className?: string;
  spacing?: 'sm' | 'md' | 'lg';
}

export function StaggerList({
  children,
  direction = 'vertical',
  className = '',
  spacing = 'md',
}: StaggerListProps) {
  const spacingMap = {
    sm: 'gap-2',
    md: 'gap-4',
    lg: 'gap-6',
  };

  const directionClass = direction === 'horizontal' ? 'flex flex-row' : 'flex flex-col';

  return (
    <StaggerContainer
      staggerDelay={0.1}
      className={`${directionClass} ${spacingMap[spacing]} ${className}`}
    >
      {children}
    </StaggerContainer>
  );
}
