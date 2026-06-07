'use client';

import {
  type ElementType,
  type JSX,
  useEffect,
  useRef,
  useState,
} from 'react';
import { motion, type MotionProps } from 'framer-motion';

type TextScrambleProps = {
  children: string;
  duration?: number;
  speed?: number;
  characterSet?: string;
  as?: ElementType;
  className?: string;
  trigger?: boolean;
  onScrambleComplete?: () => void;
} & MotionProps;

const defaultChars =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function TextScramble({
  children,
  duration = 0.8,
  speed = 0.04,
  characterSet = defaultChars,
  className,
  as: Component = 'p',
  trigger = true,
  onScrambleComplete,
  ...props
}: TextScrambleProps) {
  const MotionComponent = motion.create(Component as keyof JSX.IntrinsicElements);
  const [displayText, setDisplayText] = useState(children);
  const isAnimatingRef = useRef(false);
  const text = children;

  useEffect(() => {
    if (!trigger) return;

    if (isAnimatingRef.current) return;
    isAnimatingRef.current = true;

    const steps = Math.max(1, Math.round(duration / speed));
    let step = 0;

    const interval = window.setInterval(() => {
      let scrambled = '';
      const progress = step / steps;

      for (let i = 0; i < text.length; i++) {
        if (text[i] === ' ') {
          scrambled += ' ';
          continue;
        }

        if (progress * text.length > i) {
          scrambled += text[i];
        } else {
          scrambled +=
            characterSet[Math.floor(Math.random() * characterSet.length)];
        }
      }

      setDisplayText(scrambled);
      step++;

      if (step > steps) {
        window.clearInterval(interval);
        setDisplayText(text);
        isAnimatingRef.current = false;
        onScrambleComplete?.();
      }
    }, speed * 1000);

    return () => {
      window.clearInterval(interval);
      isAnimatingRef.current = false;
    };
  }, [trigger, text, duration, speed, characterSet, onScrambleComplete]);

  return (
    <MotionComponent className={className} {...props}>
      {displayText}
    </MotionComponent>
  );
}
