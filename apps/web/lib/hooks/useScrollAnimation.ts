'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Hook for triggering animations when elements scroll into view
 * Usage: const { ref, isVisible } = useScrollAnimation()
 *        <div ref={ref} className={isVisible ? 'animate-fade-in' : 'opacity-0'} />
 */
export function useScrollAnimation(threshold = 0.1) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          // Stop observing once visible (don't repeat animation)
          if (ref.current) {
            observer.unobserve(ref.current);
          }
        }
      },
      { threshold }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => {
      if (ref.current) {
        observer.unobserve(ref.current);
      }
    };
  }, [threshold]);

  return { ref, isVisible };
}

/**
 * Hook for parallax scroll effects
 * Usage: const offset = useParallaxScroll(0.5)
 *        <div style={{ transform: `translateY(${offset}px)` }} />
 */
export function useParallaxScroll(speed = 0.5) {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      setOffset(window.scrollY * speed);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [speed]);

  return offset;
}

/**
 * Hook for mouse follow effect
 * Usage: const { ref, position } = useMouseFollow()
 */
export function useMouseFollow() {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!ref.current) return;

      const rect = ref.current.getBoundingClientRect();
      setPosition({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    };

    const element = ref.current;
    if (element) {
      element.addEventListener('mousemove', handleMouseMove);
    }

    return () => {
      if (element) {
        element.removeEventListener('mousemove', handleMouseMove);
      }
    };
  }, []);

  return { ref, position };
}

/**
 * Hook for scroll direction detection
 * Usage: const direction = useScrollDirection()
 *        // Returns 'up' | 'down' | 'idle'
 */
export function useScrollDirection() {
  const [scrollDirection, setScrollDirection] = useState<'up' | 'down' | 'idle'>('idle');
  const previousScrollY = useRef(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;

      if (Math.abs(currentScrollY - previousScrollY.current) < 5) {
        setScrollDirection('idle');
        return;
      }

      if (currentScrollY > previousScrollY.current) {
        setScrollDirection('down');
      } else {
        setScrollDirection('up');
      }

      previousScrollY.current = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return scrollDirection;
}

/**
 * Hook for animation frame timing (optimized animations)
 * Usage: const animationFrame = useAnimationFrame(callback)
 */
export function useAnimationFrame(callback: () => void) {
  const frameRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const animate = () => {
      callback();
      frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [callback]);
}
