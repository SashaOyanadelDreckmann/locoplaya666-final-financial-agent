'use client';

import type { ElementType, HTMLAttributes } from 'react';
import { TextScramble } from '@/components/ui/text-scramble';
import { cn } from '@/lib/compartido/utils';

type CornerFrameScrambleTextProps = {
  value: string | number;
  className?: string;
  as?: ElementType;
  duration?: number;
  speed?: number;
  onScrambleComplete?: () => void;
} & HTMLAttributes<HTMLDivElement>;

export function CornerFrameScrambleText({
  value,
  className,
  as,
  duration,
  speed,
  onScrambleComplete,
  ...props
}: CornerFrameScrambleTextProps) {
  const text = String(value);

  return (
    <div
      className={cn(
        'corner-frame-scramble relative inline-block max-w-full px-5 py-2.5',
        'bg-[linear-gradient(to_right,var(--foreground)_1.5px,transparent_1.5px),linear-gradient(to_right,var(--foreground)_1.5px,transparent_1.5px),linear-gradient(to_left,var(--foreground)_1.5px,transparent_1.5px),linear-gradient(to_left,var(--foreground)_1.5px,transparent_1.5px),linear-gradient(to_bottom,var(--foreground)_1.5px,transparent_1.5px),linear-gradient(to_bottom,var(--foreground)_1.5px,transparent_1.5px),linear-gradient(to_top,var(--foreground)_1.5px,transparent_1.5px),linear-gradient(to_top,var(--foreground)_1.5px,transparent_1.5px)]',
        'bg-[length:15px_15px] bg-no-repeat',
        'bg-[position:0_0,0_100%,100%_0,100%_100%,0_0,100%_0,0_100%,100%_100%]',
        className
      )}
      {...props}
    >
      <TextScramble
        key={text}
        as={as}
        className="relative z-10 break-words"
        duration={duration}
        speed={speed}
        onScrambleComplete={onScrambleComplete}
      >
        {text}
      </TextScramble>
    </div>
  );
}

export default CornerFrameScrambleText;
