'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { ReactNode } from 'react';

interface AnimatedModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  size?: 'sm' | 'md' | 'lg' | 'full';
  blur?: boolean;
  centered?: boolean;
}

/**
 * Premium modal with smooth animations and glassmorphism
 * Features:
 * - Backdrop blur effect
 * - Smooth scale & fade transitions
 * - Centered positioning option
 * - Click outside to close
 */
export function AnimatedModal({
  isOpen,
  onClose,
  children,
  title,
  size = 'md',
  blur = true,
  centered = true,
}: AnimatedModalProps) {
  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-2xl',
    full: 'max-w-4xl',
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={onClose}
            style={{
              position: 'fixed',
              inset: 0,
              backdropFilter: blur ? 'blur(8px)' : 'none',
              WebkitBackdropFilter: blur ? 'blur(8px)' : 'none',
              background: 'rgba(0, 0, 0, 0.5)',
              zIndex: 1000,
            }}
          />

          {/* Modal Content */}
          <motion.div
            className={`modal-content ${sizeClasses[size]} ${centered ? 'centered' : ''}`}
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{
              duration: 0.4,
              ease: [0.34, 1.56, 0.64, 1],
            }}
            style={{
              position: 'fixed',
              [centered ? 'top' : 'top']: centered ? '50%' : '20%',
              left: '50%',
              transform: centered ? 'translate(-50%, -50%)' : 'translateX(-50%)',
              zIndex: 1001,
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: '24px',
              boxShadow: 'var(--shadow-lg)',
              maxHeight: '90vh',
              overflow: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {title && (
              <motion.h2
                className="modal-title"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.3 }}
                style={{
                  fontSize: '1.5rem',
                  fontWeight: 600,
                  marginBottom: '16px',
                  color: 'var(--fg)',
                }}
              >
                {title}
              </motion.h2>
            )}

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.15, duration: 0.3 }}
            >
              {children}
            </motion.div>

            {/* Close button */}
            <motion.button
              onClick={onClose}
              className="modal-close-button"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: 'transparent',
                border: 'none',
                color: 'var(--fg-secondary)',
                cursor: 'pointer',
                fontSize: '24px',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 'var(--radius-sm)',
                transition: 'all 0.2s ease',
              }}
            >
              ✕
            </motion.button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
