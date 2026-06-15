type ParserMeta = {
  confidence?: unknown;
  mode?: unknown;
};

type StructuredDoc = {
  rowCount?: unknown;
  possibleTransactionCount?: unknown;
  parserMeta?: ParserMeta;
  tables?: unknown[];
  documentProfile?: {
    confidence?: number;
    format_family?: string;
    bank?: string;
    needs_rag?: boolean;
  };
};

type DocumentInsight = {
  row_count: number;
  reliability: number;
};

type ParsedMovementLike = {
  source_kind?: 'table' | 'line';
};

export function shouldReconcileMovements(
  documents: Array<{ structuredData?: unknown }>,
  heuristicMovements: ParsedMovementLike[],
): boolean {
  if (heuristicMovements.length > 400) return false;

  const tableMovements = heuristicMovements.filter((movement) => movement.source_kind === 'table').length;
  const tableRatio =
    heuristicMovements.length > 0 ? tableMovements / heuristicMovements.length : 0;

  if (heuristicMovements.length === 0) {
    return documents.some((doc) => {
      const structured = (doc.structuredData as StructuredDoc | null | undefined) ?? {};
      const rowCount = Math.max(
        Number(structured.rowCount ?? 0) || 0,
        Number(structured.possibleTransactionCount ?? 0) || 0,
      );
      const visionTableRows = Array.isArray(structured.tables)
        ? structured.tables.reduce<number>((total, table) => {
            const rows = (table as { rows?: unknown }).rows;
            return total + (Array.isArray(rows) ? rows.length : 0);
          }, 0)
        : 0;
      const parserMode = String(structured.parserMeta?.mode ?? '').toLowerCase();
      if (visionTableRows >= 3 && parserMode.includes('vision')) return true;
      return rowCount >= 8;
    });
  }

  let needsReconcile = false;
  for (const doc of documents) {
    const structured = (doc.structuredData as StructuredDoc | null | undefined) ?? {};
    const parserConfidence = Number(structured.parserMeta?.confidence ?? 0) || 0;
    const mode = String(structured.parserMeta?.mode ?? '').toLowerCase();
    const rowCount = Math.max(
      Number(structured.rowCount ?? 0) || 0,
      Number(structured.possibleTransactionCount ?? 0) || 0,
    );
    const profileConfidence = Number(structured.documentProfile?.confidence ?? 0) || 0;
    const profileFamily = String(structured.documentProfile?.format_family ?? '').toLowerCase();
    const hasSpecificProfile =
      profileFamily.includes('banco_') ||
      profileFamily.includes('visa_signature') ||
      profileFamily.includes('ledger') ||
      profileFamily.includes('fintech') ||
      profileFamily.includes('cartola') ||
      profileFamily.includes('estado_cuenta');

    if ((mode === 'csv_exact' || mode === 'exact_sheet') && parserConfidence >= 0.95) {
      continue;
    }
    if (profileConfidence >= 0.92 && !structured.documentProfile?.needs_rag && hasSpecificProfile) {
      continue;
    }
    if (parserConfidence >= 0.93 && tableRatio >= 0.65 && heuristicMovements.length >= 3) {
      continue;
    }
    if (parserConfidence > 0 && parserConfidence < 0.82) {
      needsReconcile = true;
      continue;
    }
    if (rowCount >= 10 && heuristicMovements.length / rowCount < 0.22) {
      needsReconcile = true;
    }
  }

  return needsReconcile;
}

export function buildExecutiveSummaryText(params: {
  movementCount: number;
  tableBasedMovements: number;
  inflowsTotal: number;
  outflowsTotal: number;
  netFlow: number;
  inflowLabel?: string;
  topCategories: Array<{ name: string; amount: number }>;
  topMerchants: Array<{ merchant: string; amount: number }>;
  alerts: string[];
  period?: { from?: string; to?: string };
  formatAmount: (value: number) => string;
}): string {
  if (params.movementCount === 0) {
    return 'Sin movimientos suficientes\nNo hay base confiable para un resumen. Refuerza la evidencia subida.';
  }

  const periodLabel =
    params.period?.from && params.period?.to
      ? `${params.period.from} a ${params.period.to}`
      : null;
  const inflowLabel = params.inflowLabel ?? 'Ingresos';
  const blocks: string[] = [];

  blocks.push(
    [
      'Panorama del periodo',
      [
        `Se detectaron ${params.movementCount} movimientos válidos${periodLabel ? ` (${periodLabel})` : ''}.`,
        `${params.tableBasedMovements} provienen de tabla estructurada.`,
      ].join(' '),
    ].join('\n'),
  );

  blocks.push(
    [
      'Balance detectado',
      `${inflowLabel} ${params.formatAmount(params.inflowsTotal)} · Egresos ${params.formatAmount(params.outflowsTotal)} · Flujo neto ${params.formatAmount(params.netFlow)}`,
    ].join('\n'),
  );

  if (params.topCategories.length > 0) {
    blocks.push(
      [
        'Categorías de gasto',
        ...params.topCategories
          .slice(0, 3)
          .map((category) => `• ${category.name} — ${params.formatAmount(category.amount)}`),
      ].join('\n'),
    );
  }

  if (params.topMerchants.length > 0) {
    blocks.push(
      [
        'Comercios destacados',
        ...params.topMerchants
          .slice(0, 3)
          .map((merchant) => `• ${merchant.merchant} — ${params.formatAmount(merchant.amount)}`),
      ].join('\n'),
    );
  }

  if (params.alerts.length > 0) {
    blocks.push(
      [
        'Puntos a revisar',
        ...params.alerts.slice(0, 3).map((alert) => `• ${alert}`),
      ].join('\n'),
    );
  }

  return blocks.join('\n\n');
}
