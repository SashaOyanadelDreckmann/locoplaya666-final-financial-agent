'use client';

import { motion } from 'framer-motion';
import type { ComponentPropsWithoutRef, CSSProperties, PropsWithChildren } from 'react';

type AnimatedPanelCardProps = PropsWithChildren<
  Omit<ComponentPropsWithoutRef<'article'>, 'children' | 'onDrag' | 'onDragStart' | 'onDragEnd'> & {
    label?: string;
    value?: string;
    className?: string;
    bgImage?: string;
    overlayColor?: string;
    overlayOpacity?: number;
    bgScale?: number;
    bgPosition?: string;
    dataMode?: string;
    delay?: number;
    hoverable?: boolean;
  }
>;

/**
 * Premium animated panel card with hover lift, glow effects, and smooth transitions
 * Features: GPU acceleration, stagger animations, glassmorphism on hover
 */
export function AnimatedPanelCard({
  label,
  value,
  className,
  children,
  bgImage,
  overlayColor,
  overlayOpacity,
  bgScale,
  bgPosition,
  dataMode,
  delay = 0,
  hoverable = true,
  ...rest
}: AnimatedPanelCardProps) {
  const classes = ['panel-card', className].filter(Boolean).join(' ');
  const style = {
    ...(bgImage ? { ['--card-bg' as string]: `url('${bgImage}')` } : {}),
    ...(overlayColor ? { ['--card-overlay-color' as string]: overlayColor } : {}),
    ...(typeof overlayOpacity === 'number'
      ? { ['--card-overlay-opacity' as string]: String(overlayOpacity) }
      : {}),
    ...(typeof bgScale === 'number' ? { ['--bg-scale' as string]: String(bgScale) } : {}),
    ...(bgPosition ? { ['--bg-position' as string]: bgPosition } : {}),
  } as CSSProperties;

  return (
    <motion.article
      className={classes}
      style={style}
      data-mode={dataMode}
      initial={{ opacity: 0, scale: 0.95, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{
        duration: 0.6,
        delay,
        ease: [0.34, 1.56, 0.64, 1], // cubic-bezier with bounce
        type: 'spring',
        stiffness: 100,
        damping: 15,
      }}
      whileHover={hoverable ? {
        y: -8,
        scale: 1.02,
        transition: { duration: 0.3 }
      } : undefined}
      whileTap={hoverable ? { scale: 0.98 } : undefined}
      {...rest}
    >
      {label ? <p className="panel-label">{label}</p> : null}
      {value ? <h4 className="panel-value">{value}</h4> : null}
      {children}
    </motion.article>
  );
}
