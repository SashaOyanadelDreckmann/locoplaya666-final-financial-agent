'use client';

import type { CSSProperties } from 'react';

export const RETRO_CHART_COLORS = [
  '#2f6f73',
  '#3d8b8f',
  '#b79643',
  '#5b7f95',
  '#a85d63',
  '#4f9da0',
];

export const RETRO_CHART_NEGATIVE = '#7a4b54';

export const RETRO_TOOLTIP_STYLE: CSSProperties = {
  background: 'rgba(22, 26, 34, 0.96)',
  border: '3px solid rgba(210, 220, 232, 0.42)',
  borderRadius: 0,
  boxShadow: '6px 6px 0 rgba(8, 10, 16, 0.36)',
  color: '#f8fafc',
};

export const RETRO_TICK = { fill: '#8ea0b3', fontSize: 10 };
export const RETRO_GRID = 'rgba(164, 180, 196, 0.16)';

type RetroBarShapeProps = {
  fill?: string;
  height?: number;
  width?: number;
  x?: number;
  y?: number;
};

export function RetroBarShape(props: RetroBarShapeProps) {
  const { fill = RETRO_CHART_COLORS[0], x = 0, y = 0, width = 0, height = 0 } = props;
  const safeWidth = Math.max(Math.abs(width), 0);
  const safeHeight = Math.max(Math.abs(height), 0);
  const left = width >= 0 ? x : x + width;
  const top = height >= 0 ? y : y + height;
  const bevel = Math.min(8, Math.max(3, Math.min(safeWidth, safeHeight) * 0.18));

  return (
    <g shapeRendering="crispEdges">
      <rect x={left} y={top} width={safeWidth} height={safeHeight} fill={fill} stroke="rgba(10,14,20,0.68)" strokeWidth={2} />
      <rect x={left + 2} y={top + 2} width={Math.max(safeWidth - 4, 0)} height={bevel} fill="rgba(255,255,255,0.16)" />
    </g>
  );
}

type RetroDotProps = {
  cx?: number;
  cy?: number;
  stroke?: string;
};

export function RetroDot(props: RetroDotProps) {
  const { cx = 0, cy = 0, stroke = RETRO_CHART_COLORS[0] } = props;
  return <rect x={cx - 4} y={cy - 4} width={8} height={8} fill={stroke} stroke="#f8fafc" strokeWidth={2} shapeRendering="crispEdges" />;
}
