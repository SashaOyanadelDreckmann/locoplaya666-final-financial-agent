'use client';

import { useEffect, useMemo, useState } from 'react';

type TypewriterTextProps = {
  text: string;
  speed?: number;
};

export function TypewriterText({ text, speed = 20 }: TypewriterTextProps) {
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

  return <pre>{text.slice(0, index)}</pre>;
}
