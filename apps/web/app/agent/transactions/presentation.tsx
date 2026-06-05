'use client';

import type { CSSProperties } from 'react';

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

export function buildEditorialSummaryBlocks(text: string | null | undefined) {
  return String(text ?? '')
    .split(/\n\s*\n+/)
    .map((block) => block.replace(/\s*\n+\s*/g, ' ').trim())
    .filter(Boolean)
    .map((block, index) => {
      const match = block.match(/^([^:]{12,96}):\s*(.+)$/);
      if (match && index > 0) {
        return {
          lead: false,
          kicker: match[1].trim(),
          body: match[2].trim(),
        };
      }
      return {
        lead: index === 0,
        kicker: null,
        body: block,
      };
    });
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
          <p className="tx-summary-editorial-body">{block.body}</p>
        </article>
      ))}
    </div>
  );
}

export function getFormatLabel(format: 'photos' | 'pdf' | 'spreadsheet' | 'text' | 'video'): string {
  if (format === 'photos') return 'Fotos';
  if (format === 'pdf') return 'PDF';
  if (format === 'spreadsheet') return 'Excel / CSV';
  if (format === 'video') return 'Rápido';
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

export function getFormatMicrocopy(format: 'photos' | 'pdf' | 'spreadsheet' | 'text' | 'video'): string {
  if (format === 'photos') return 'capturas limpias';
  if (format === 'pdf') return 'cartola completa';
  if (format === 'spreadsheet') return 'filas estructuradas';
  if (format === 'video') return 'grabación de pantalla';
  return 'entrada manual';
}

export function buildUploadGuidance(
  format: 'photos' | 'pdf' | 'spreadsheet' | 'text' | 'video',
  productType: import('./types').BankProduct['productType'],
) {
  const productLabel = productType === 'credit_card' ? 'tu tarjeta' : 'tu producto';
  if (format === 'video') {
    return `Perfecto. Usa el modo Rápido con una grabación de pantalla de ${productLabel}: abre la app, entra a movimientos, baja despacio de arriba hacia abajo una sola vez y evita zoom, cortes o ediciones. Si el banco muestra filtros por fechas, deja el rango visible antes de grabar.`;
  }
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

export function renderFormatIcon(format: 'photos' | 'pdf' | 'spreadsheet' | 'text' | 'video') {
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
  if (format === 'video') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="4.5" y="5.5" width="12" height="13" rx="3" stroke="currentColor" strokeWidth="1.4" />
        <path d="M10 9l4 3-4 3V9z" fill="currentColor" />
        <path d="M18 9.5l1.5-1v6l-1.5-1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
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
