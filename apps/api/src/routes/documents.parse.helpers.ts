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
    return 'No hay movimientos suficientes para un resumen confiable. Se recomienda reforzar evidencia.';
  }

  const periodLabel =
    params.period?.from && params.period?.to
      ? ` (${params.period.from} a ${params.period.to})`
      : '';
  const inflowLabel = params.inflowLabel ?? 'Ingresos';
  const lines = [
    `Se detectaron ${params.movementCount} movimientos válidos${periodLabel}, con ${params.tableBasedMovements} desde tabla estructurada. ${inflowLabel} ${params.formatAmount(params.inflowsTotal)}, egresos ${params.formatAmount(params.outflowsTotal)} y flujo neto ${params.formatAmount(params.netFlow)}.`,
  ];

  if (params.topCategories.length > 0) {
    const topCategories = params.topCategories
      .slice(0, 3)
      .map((category) => `${category.name} ${params.formatAmount(category.amount)}`)
      .join('; ');
    lines.push(`Principales categorías de gasto: ${topCategories}.`);
  }

  if (params.topMerchants.length > 0) {
    const topMerchants = params.topMerchants
      .slice(0, 2)
      .map((merchant) => `${merchant.merchant} (${params.formatAmount(merchant.amount)})`)
      .join(', ');
    lines.push(`Comercios destacados: ${topMerchants}.`);
  }

  if (params.alerts.length > 0) {
    lines.push(`Puntos a revisar: ${params.alerts.slice(0, 2).join(' ')}`);
  }

  return lines.join(' ');
}
