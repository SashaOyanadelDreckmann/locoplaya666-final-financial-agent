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

  function handleMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }

  return (
    <div
      ref={ref}
      onMouseMove={handleMove}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
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
