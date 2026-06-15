'use client';

import type { CSSProperties } from 'react';
import type { TxUploadFormat } from './types';

export type TxDockTransitionPhase = 'idle' | 'authorizing' | 'flood' | 'library-reveal' | 'chat-reveal';

export function NumericDust({
  scope,
  pulse,
  active = true,
  count = 24,
}: {
  scope: string;
  pulse: number;
  active?: boolean;
  count?: number;
}) {
  return (
    <div
      className={`tx-digit-dust tx-digit-dust--${scope}${active ? ' is-active' : ''}`}
      aria-hidden="true"
    >
      {Array.from({ length: count }, (_, idx) => {
        const digit = (idx * 3 + pulse * 7 + scope.length) % 10;
        const style = {
          ['--dust-x' as any]: `${(idx * 37 + pulse * 11) % 100}%`,
          ['--dust-y' as any]: `${(idx * 19 + pulse * 13) % 100}%`,
          ['--dust-delay' as any]: `${(idx % 9) * 0.08}s`,
          ['--dust-duration' as any]: `${4.2 + (idx % 5) * 0.55}s`,
          ['--dust-depth' as any]: `${((idx % 7) - 3) * 16}px`,
          ['--dust-scale' as any]: `${0.7 + (idx % 4) * 0.12}`,
          ['--dust-rotate' as any]: `${(idx % 6) * 14 - 28}deg`,
        } as CSSProperties;
        return (
          <span key={`${scope}-${idx}-${pulse}`} style={style}>
            {digit}
          </span>
        );
      })}
    </div>
  );
}

export type EditorialSummaryBlock = {
  lead: boolean;
  kicker: string | null;
  body: string;
};

const LEGACY_EXECUTIVE_SECTION_MARKERS = [
  'Principales categorías de gasto:',
  'Comercios destacados:',
  'Puntos a revisar:',
  'Principales cargos detectados:',
  'Dónde parece concentrarse el gasto:',
  'Comercios o conceptos recurrentes:',
  'Señales a revisar:',
  'Patrón dominante:',
  'Nota de fidelidad',
] as const;

export function normalizeExecutiveSummaryText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed || trimmed.includes('\n\n')) return trimmed;

  let normalized = trimmed;

  normalized = normalized.replace(
    /(desde tabla estructurada\.)\s*((?:Ingresos|Abonos)\s+[^.]+\.)/i,
    '$1\n\nBalance detectado\n$2\n\n',
  );
  if (!/^Panorama del periodo/m.test(normalized) && /^Se detectaron/i.test(normalized)) {
    normalized = normalized.replace(/^(Se detectaron[\s\S]+?desde tabla estructurada\.)/i, 'Panorama del periodo\n$1');
  }

  for (const marker of LEGACY_EXECUTIVE_SECTION_MARKERS) {
    const pattern = new RegExp(`(?=\\s*${marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'i');
    normalized = normalized.replace(pattern, '\n\n');
  }

  return normalized.replace(/\n{3,}/g, '\n\n').trim();
}

function parseEditorialBlock(block: string, index: number): EditorialSummaryBlock {
  const trimmed = block.trim();
  const colonMatch = trimmed.match(/^([^:\n]{4,56}):\s*([\s\S]+)$/);
  if (colonMatch && !colonMatch[1].includes('.')) {
    return {
      lead: index === 0,
      kicker: colonMatch[1].trim(),
      body: colonMatch[2].trim(),
    };
  }

  const lines = trimmed.split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length >= 2 && lines[0].length <= 56 && !/[.!?]$/.test(lines[0])) {
    return {
      lead: index === 0,
      kicker: lines[0],
      body: lines.slice(1).join('\n'),
    };
  }

  return {
    lead: index === 0,
    kicker: null,
    body: trimmed.replace(/\s*\n+\s*/g, ' '),
  };
}

export function buildEditorialSummaryBlocks(text: string | null | undefined): EditorialSummaryBlock[] {
  return normalizeExecutiveSummaryText(String(text ?? ''))
    .split(/\n\s*\n+/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block, index) => parseEditorialBlock(block, index));
}

function renderEditorialBody(body: string) {
  const lines = body
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const bulletLines = lines.filter((line) => line.startsWith('•'));
  if (bulletLines.length > 0 && bulletLines.length === lines.length) {
    return (
      <ul className="tx-summary-editorial-list">
        {bulletLines.map((line, index) => (
          <li key={`${line}-${index}`}>{line.replace(/^•\s*/, '')}</li>
        ))}
      </ul>
    );
  }

  if (lines.length > 1) {
    return (
      <div className="tx-summary-editorial-body-stack">
        {lines.map((line, index) => (
          <p key={`${line}-${index}`} className="tx-summary-editorial-body">
            {line}
          </p>
        ))}
      </div>
    );
  }

  return <p className="tx-summary-editorial-body">{body}</p>;
}

export function EditorialSummary({
  text,
  compact = false,
  onBlockDoubleClick,
}: {
  text: string | null | undefined;
  compact?: boolean;
  onBlockDoubleClick?: (payload: { kicker?: string | null; body: string }) => void;
}) {
  const blocks = buildEditorialSummaryBlocks(text);
  if (blocks.length === 0) return null;
  return (
    <div className={`tx-summary-editorial${compact ? ' is-compact' : ''}`}>
      {blocks.map((block, index) => (
        <article
          key={`${block.kicker ?? 'block'}-${index}`}
          className={`tx-summary-editorial-block${block.lead ? ' is-lead' : ''}${onBlockDoubleClick ? ' is-refinable' : ''}`}
          onDoubleClick={() => onBlockDoubleClick?.({ kicker: block.kicker, body: block.body })}
          title={onBlockDoubleClick ? 'Doble clic para reanalizar este hallazgo' : undefined}
        >
          {block.kicker ? <span className="tx-summary-editorial-kicker">{block.kicker}</span> : null}
          {renderEditorialBody(block.body)}
        </article>
      ))}
    </div>
  );
}

export function getFormatLabel(format: TxUploadFormat): string {
  if (format === 'photos') return 'Fotos';
  if (format === 'pdf') return 'PDF';
  if (format === 'spreadsheet') return 'Excel / CSV';
  return 'Texto';
}

export function formatPercentCompact(value: number | null | undefined) {
  if (!Number.isFinite(Number(value))) return 'N/D';
  return `${Number(value).toFixed(1)}%`;
}

export function confidenceBand(value: number | null | undefined) {
  const numeric = Number(value ?? 0);
  if (numeric >= 0.92) return 'Alta';
  if (numeric >= 0.8) return 'Media';
  return 'Baja';
}

export function confidenceBandLong(value: number | null | undefined) {
  const numeric = Number(value ?? 0);
  if (numeric >= 0.92) return 'Alta';
  if (numeric >= 0.8) return 'Media';
  if (numeric >= 0.65) return 'Mixta';
  return 'Baja';
}

export function movementSourceLabel(value?: string | null) {
  return value === 'table' ? 'Tabla' : 'Texto';
}

export function getFormatMicrocopy(format: TxUploadFormat): string {
  if (format === 'photos') return 'capturas limpias';
  if (format === 'pdf') return 'cartola completa';
  if (format === 'spreadsheet') return 'filas estructuradas';
  return 'entrada manual';
}

export function buildUploadGuidance(
  format: TxUploadFormat,
  productType: import('./types').BankProduct['productType'],
) {
  const productLabel = productType === 'credit_card' ? 'tu tarjeta' : 'tu producto';
  if (format === 'photos') {
    return `Perfecto. Para fotos de ${productLabel}: 1) usa capturas nítidas, 2) no repitas un movimiento en dos pantallazos, 3) el siguiente pantallazo debe partir mostrando el último movimiento visible abajo en el anterior, 4) la última captura puede cortar al final. Cuando las tengas, súbelas y presiona Enviar.`;
  }
  if (format === 'pdf') {
    return `Perfecto. Sube el PDF completo de ${productLabel}. Si tiene clave o mala extracción, mejor usa capturas nítidas del mismo período. Luego presiona Enviar.`;
  }
  if (format === 'spreadsheet') {
    return `Ideal. Excel o CSV suele ser el formato más limpio. Mantén fecha, detalle y monto por fila, evita celdas combinadas y sube el archivo con Enviar.`;
  }
  return `Puedes pegar texto manual si no tienes archivo. Incluye fecha, detalle y monto por línea. Si luego consigues PDF o Excel, mejor aún. Cuando estés listo, usa Enviar.`;
}

export function renderFormatIcon(format: TxUploadFormat) {
  if (format === 'photos') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="4.5" y="6" width="15" height="12" rx="3" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="9" cy="10" r="1.2" fill="currentColor" />
        <path d="M7.5 15l3-3 2.5 2.5 2-2 1.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (format === 'pdf') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M8 4.5h6l4 4V18a1.5 1.5 0 01-1.5 1.5h-8A1.5 1.5 0 017 18V6a1.5 1.5 0 011.5-1.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M14 4.5V9h4" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    );
  }
  if (format === 'spreadsheet') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="5" y="5.5" width="14" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.4" />
        <path d="M10 5.5v13M14.5 5.5v13M5 10h14M5 14h14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 8.5h10M7 12h7M7 15.5h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <rect x="4.5" y="5" width="15" height="14" rx="3" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
