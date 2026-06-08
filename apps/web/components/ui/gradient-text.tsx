'use client';

import type { ElementType, JSX } from 'react';
import { motion, type MotionProps } from 'motion/react';

import { cn } from '@/lib/utils';

type GradientTextProps = {
  className?: string;
  children: React.ReactNode;
  as?: ElementType;
} & MotionProps;

function GradientText({
  className,
  children,
  as: Component = 'span',
  ...props
}: GradientTextProps) {
  const MotionComponent = motion.create(Component as keyof JSX.IntrinsicElements);

  return (
    <MotionComponent
      className={cn(
        'relative inline-flex overflow-hidden bg-white dark:bg-black',
        className,
      )}
      {...props}
    >
      {children}
      <span className="gradient-text__aurora pointer-events-none absolute inset-0 mix-blend-lighten dark:mix-blend-darken">
        <span className="gradient-text__blob gradient-text__blob--red pointer-events-none absolute -top-1/2 h-[30vw] w-[30vw] animate-[gradient-border_6s_ease-in-out_infinite,gradient-1_12s_ease-in-out_infinite_alternate] bg-[hsl(var(--color-1))] mix-blend-overlay blur-[1rem]" />
        <span className="gradient-text__blob gradient-text__blob--blue pointer-events-none absolute right-0 top-0 h-[30vw] w-[30vw] animate-[gradient-border_6s_ease-in-out_infinite,gradient-2_12s_ease-in-out_infinite_alternate] bg-[hsl(var(--color-2))] mix-blend-overlay blur-[1rem]" />
        <span className="gradient-text__blob gradient-text__blob--yellow pointer-events-none absolute bottom-0 left-0 h-[30vw] w-[30vw] animate-[gradient-border_6s_ease-in-out_infinite,gradient-3_12s_ease-in-out_infinite_alternate] bg-[hsl(var(--color-3))] mix-blend-overlay blur-[1rem]" />
      </span>
    </MotionComponent>
  );
}

export { GradientText };
