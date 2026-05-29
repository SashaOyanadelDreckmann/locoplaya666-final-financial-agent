'use client';

import { useEffect, useMemo, useState } from 'react';

type TypewriterTextProps = {
  text: string;
  speed?: number;
  colorizeSpecial?: boolean;
  className?: string;
};

export function TypewriterText({ text, speed = 20, colorizeSpecial = false, className }: TypewriterTextProps) {
  const [index, setIndex] = useState(0);
  const safeSpeed = useMemo(() => Math.max(1, speed), [speed]);

  useEffect(() => {
    setIndex(0);
  }, [text]);

  useEffect(() => {
    if (index >= text.length) return;

    const timer = setTimeout(() => {
      setIndex((prev) => prev + 1);
    }, safeSpeed);

    return () => clearTimeout(timer);
  }, [index, text, safeSpeed]);

  const visibleText = text.slice(0, index);

  const isComplete = index >= text.length;

  if (!colorizeSpecial) return <pre className={className}>{visibleText}</pre>;

  return (
    <pre className={`${className ?? ''}${isComplete ? ' typewriter-complete' : ''}`}>
      {Array.from(visibleText).map((char, charIndex) => {
        const isSpecial = /[▄▀█▌▐▓─]/.test(char);
        if (!isSpecial) return char;

        return (
          <span className={`typewriter-accent typewriter-accent--${charIndex % 3}`} key={`${char}-${charIndex}`}>
            {char}
          </span>
        );
      })}
    </pre>
  );
}
