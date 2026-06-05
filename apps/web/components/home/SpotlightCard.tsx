'use client';

import { useRef, useState, type ReactNode } from 'react';

interface SpotlightCardProps {
  children: ReactNode;
  className?: string;
  /** Color del glow que sigue al cursor */
  glow?: string;
}

/**
 * Card con un resplandor radial que sigue al cursor (estilo "spotlight").
 * El borde también se ilumina sutilmente cerca del puntero.
 */
export default function SpotlightCard({
  children,
  className = '',
  glow = 'rgba(111,143,166,0.16)',
}: SpotlightCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);

  function handleMove(clientX: number, clientY: number) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({ x: clientX - rect.left, y: clientY - rect.top });
  }

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    handleMove(e.clientX, e.clientY);
  }

  function handleTouchMove(e: React.TouchEvent<HTMLDivElement>) {
    const touch = e.touches[0];
    if (touch) handleMove(touch.clientX, touch.clientY);
  }

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onTouchStart={() => setActive(true)}
      onTouchMove={handleTouchMove}
      onTouchEnd={() => setActive(false)}
      onTouchCancel={() => setActive(false)}
      className={`group relative overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.015] transition-colors duration-500 hover:border-white/[0.12] ${className}`}
    >
      {/* Glow que sigue al cursor */}
      <div
        className="pointer-events-none absolute -inset-px z-0 transition-opacity duration-300"
        style={{
          opacity: active ? 1 : 0,
          background: `radial-gradient(380px circle at ${pos.x}px ${pos.y}px, ${glow}, transparent 65%)`,
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
