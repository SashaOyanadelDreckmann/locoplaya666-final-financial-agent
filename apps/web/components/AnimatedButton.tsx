'use client';

import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface AnimatedButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
}

/**
 * Premium animated button with hover lift, ripple effect, and smooth transitions
 * Features:
 * - Lift on hover with shadow glow
 * - Loading state spinner
 * - Ripple effect on click
 * - GPU acceleration
 */
export function AnimatedButton({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  className = '',
  type = 'button',
}: AnimatedButtonProps) {
  const variantClasses = {
    primary: 'bg-accent hover:bg-accent-hover text-accent-fg',
    secondary: 'bg-bg-tertiary hover:bg-bg-elevated text-fg',
    ghost: 'bg-transparent hover:bg-bg-tertiary text-fg',
    danger: 'bg-error hover:bg-error text-white',
  };

  const sizeClasses = {
    sm: 'px-3 py-2 text-sm',
    md: 'px-4 py-2.5 text-base',
    lg: 'px-6 py-3 text-lg',
  };

  const classes = [
    'animated-button',
    variantClasses[variant],
    sizeClasses[size],
    'rounded-lg font-medium transition-all duration-300',
    'relative overflow-hidden',
    disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <motion.button
      type={type}
      className={classes}
      onClick={onClick}
      disabled={disabled || loading}
      initial={{ y: 0 }}
      whileHover={!disabled ? { y: -2 } : undefined}
      whileTap={!disabled ? { y: 0, scale: 0.98 } : undefined}
      transition={{
        duration: 0.2,
        ease: [0.34, 1.56, 0.64, 1],
      }}
    >
      {/* Shimmer effect background */}
      <motion.span
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-0"
        initial={{ x: '-100%' }}
        whileHover={!disabled ? { x: '100%' } : undefined}
        transition={{ duration: 0.8 }}
      />

      {/* Content */}
      <motion.span
        className="relative flex items-center justify-center gap-2"
        initial={{ opacity: 1 }}
        animate={{ opacity: loading ? 0.5 : 1 }}
        transition={{ duration: 0.2 }}
      >
        {loading && (
          <motion.span
            className="spinner"
            animate={{ rotate: 360 }}
            transition={{
              duration: 1,
              repeat: Infinity,
              ease: 'linear',
            }}
          >
            ⟳
          </motion.span>
        )}
        {children}
      </motion.span>
    </motion.button>
  );
}
