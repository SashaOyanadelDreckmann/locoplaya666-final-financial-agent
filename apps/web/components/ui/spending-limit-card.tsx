'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/compartido/utils';

export interface SpendingLimitCardProps {
  title: string;
  dateRange: string;
  currentSpending: number;
  limit: number;
  currency?: string;
  segments?: number;
  filledColorClass?: string;
  unfilledColorClass?: string;
  className?: string;
  footerNote?: string;
}

export function SpendingLimitCard({
  title,
  dateRange,
  currentSpending,
  limit,
  currency = '',
  segments = 10,
  filledColorClass = 'bg-emerald-400/90',
  unfilledColorClass = 'bg-white/10',
  className,
  footerNote,
}: SpendingLimitCardProps) {
  const percentage = limit > 0 ? Math.min(100, (currentSpending / limit) * 100) : 0;

  const formatAmount = (amount: number) => {
    if (currency === 'FC') {
      return `${Math.round(amount).toLocaleString('es-CL')} FC`;
    }
    return `${currency}${amount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.06 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0 },
  };

  return (
    <div
      className={cn(
        'w-full rounded-2xl border border-white/10 bg-black/55 p-5 text-white shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl',
        className,
      )}
    >
      <header>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 text-sm text-white/55">{dateRange}</p>
      </header>

      <div className="mt-5">
        <p className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {formatAmount(currentSpending)}
          <span className="ml-2 text-sm font-medium text-white/50 sm:text-base">
            de {formatAmount(limit)}
          </span>
        </p>
      </div>

      <div
        className="mt-4"
        role="progressbar"
        aria-valuenow={percentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${title} progress`}
      >
        <motion.div
          className="flex w-full items-center gap-1"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {Array.from({ length: segments }).map((_, index) => {
            const segmentFilled = percentage > (index / segments) * 100;
            return (
              <motion.div
                key={index}
                variants={itemVariants}
                className={cn(
                  'h-2 flex-1 rounded-full',
                  segmentFilled ? filledColorClass : unfilledColorClass,
                )}
              />
            );
          })}
        </motion.div>
      </div>

      {footerNote ? <p className="mt-4 text-xs leading-relaxed text-white/55">{footerNote}</p> : null}
    </div>
  );
}
