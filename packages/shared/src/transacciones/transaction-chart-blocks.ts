export const TX_CASHFLOW_MIN_DISTINCT_DAYS = 3;
export const TX_CASHFLOW_MIN_DATED_MOVEMENTS = 3;

export type TransactionMovementInput = {
  label?: string;
  merchant?: string;
  amount: number;
  direction: 'income' | 'expense';
  date?: string;
  category?: string;
};

export type TransactionCashflowMovement = {
  label: string;
  amount: number;
  direction: 'income' | 'expense';
};

export type TransactionCashflowPoint = {
  day: number;
  dayLabel: string;
  dayIncome: number;
  dayExpense: number;
  cumulativeIncome: number;
  cumulativeExpense: number;
  incomeArea: number;
  movements: TransactionCashflowMovement[];
};

export type TransactionCashflowSeries = {
  monthLabel: string;
  year: number;
  month: number;
  points: TransactionCashflowPoint[];
  distinctDays: number;
  datedMovementCount: number;
};

export type TransactionFlowBarPoint = {
  metric: string;
  value: number;
};

export type TransactionCategoryBarPoint = {
  category: string;
  amount: number;
  share: number;
};

export type TransactionChartBlock =
  | {
      type: 'tx_chart';
      tx_chart: {
        variant: 'cumulative_cashflow';
        title?: string;
        subtitle?: string;
        currency?: string;
        series: TransactionCashflowSeries;
      };
    }
  | {
      type: 'tx_chart';
      tx_chart: {
        variant: 'flow_bar';
        title?: string;
        subtitle?: string;
        currency?: string;
        inflowLabel?: string;
        data: TransactionFlowBarPoint[];
      };
    }
  | {
      type: 'tx_chart';
      tx_chart: {
        variant: 'category_bar';
        title?: string;
        subtitle?: string;
        currency?: string;
        data: TransactionCategoryBarPoint[];
      };
    };

export type TransactionChartVariant = TransactionChartBlock['tx_chart']['variant'];

export type BuildTransactionChartBlocksInput = {
  movements: TransactionMovementInput[];
  variants?: TransactionChartVariant[];
  inflowLabel?: string;
  currency?: string;
};

type ParsedMovementDate = {
  year: number;
  month: number;
  day: number;
};

function isMissingDate(value?: string | null): boolean {
  const normalized = String(value ?? '').trim().toUpperCase();
  return normalized.length === 0 || normalized === 'N/D' || normalized === 'ND';
}

function extractDateTokens(value: string): string[] {
  const source = String(value ?? '').trim();
  if (!source) return [];
  const tokens = new Set<string>();
  const isoMatch = source.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) {
    tokens.add(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`);
    tokens.add(`${isoMatch[3]}/${isoMatch[2]}`);
  }
  const dmMatch = source.match(/\b(\d{2})[/-](\d{2})(?:[/-](\d{2,4}))?\b/);
  if (dmMatch) {
    tokens.add(`${dmMatch[1]}/${dmMatch[2]}`);
    if (dmMatch[3]) {
      const yyyy = dmMatch[3].length === 2 ? `20${dmMatch[3]}` : dmMatch[3];
      tokens.add(`${yyyy}-${dmMatch[2]}-${dmMatch[1]}`);
    }
  }
  return Array.from(tokens);
}

export function parseTransactionMovementDate(
  raw: string,
  fallbackYear = new Date().getFullYear(),
): ParsedMovementDate | null {
  const source = String(raw ?? '').trim();
  if (!source || isMissingDate(source)) return null;

  const iso = source.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };

  const dmY = source.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (dmY) return { year: Number(dmY[3]), month: Number(dmY[2]), day: Number(dmY[1]) };

  const dm = source.match(/^(\d{2})[/-](\d{2})$/);
  if (dm) return { year: fallbackYear, month: Number(dm[2]), day: Number(dm[1]) };

  return null;
}

function resolveMovementDate(
  movement: TransactionMovementInput,
  fallbackYear: number,
): ParsedMovementDate | null {
  if (!isMissingDate(movement.date)) {
    const parsed = parseTransactionMovementDate(movement.date ?? '', fallbackYear);
    if (parsed) return parsed;
  }

  const tokens = [
    ...extractDateTokens(movement.date ?? ''),
    ...extractDateTokens(movement.label ?? ''),
    ...extractDateTokens(movement.merchant ?? ''),
  ];
  for (const token of tokens) {
    const parsed = parseTransactionMovementDate(token, fallbackYear);
    if (parsed) return parsed;
  }
  return null;
}

function monthKey(date: ParsedMovementDate): string {
  return `${date.year}-${String(date.month).padStart(2, '0')}`;
}

function formatMonthLabel(year: number, month: number): string {
  const label = new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric' }).format(
    new Date(year, month - 1, 1),
  );
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function movementLabel(movement: TransactionMovementInput): string {
  return String(movement.merchant || movement.label || 'Movimiento').trim() || 'Movimiento';
}

export function buildCumulativeCashflowSeries(
  movements: TransactionMovementInput[],
): TransactionCashflowSeries | null {
  if (!movements.length) return null;

  const fallbackYear = new Date().getFullYear();
  const datedRows: Array<{
    date: ParsedMovementDate;
    amount: number;
    direction: 'income' | 'expense';
    label: string;
  }> = [];

  for (const movement of movements) {
    const parsed = resolveMovementDate(movement, fallbackYear);
    if (!parsed) continue;
    const amount = Math.abs(Number(movement.amount) || 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    datedRows.push({
      date: parsed,
      amount,
      direction: movement.direction,
      label: movementLabel(movement),
    });
  }

  if (datedRows.length < TX_CASHFLOW_MIN_DATED_MOVEMENTS) return null;

  const monthCounts = new Map<string, number>();
  for (const entry of datedRows) {
    const key = monthKey(entry.date);
    monthCounts.set(key, (monthCounts.get(key) ?? 0) + 1);
  }

  const dominantMonthKey = [...monthCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!dominantMonthKey) return null;

  const [yearText, monthText] = dominantMonthKey.split('-');
  const year = Number(yearText);
  const month = Number(monthText);

  const dayBuckets = new Map<
    number,
    { income: number; expense: number; movements: TransactionCashflowMovement[] }
  >();

  for (const entry of datedRows) {
    if (monthKey(entry.date) !== dominantMonthKey) continue;
    const bucket = dayBuckets.get(entry.date.day) ?? { income: 0, expense: 0, movements: [] };
    if (entry.direction === 'income') bucket.income += entry.amount;
    else bucket.expense += entry.amount;
    bucket.movements.push({
      label: entry.label,
      amount: entry.amount,
      direction: entry.direction,
    });
    dayBuckets.set(entry.date.day, bucket);
  }

  if (dayBuckets.size < TX_CASHFLOW_MIN_DISTINCT_DAYS) return null;

  let runningIncome = 0;
  let runningExpense = 0;
  const points = [...dayBuckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([day, totals]) => {
      runningIncome += totals.income;
      runningExpense += totals.expense;
      return {
        day,
        dayLabel: String(day).padStart(2, '0'),
        dayIncome: totals.income,
        dayExpense: totals.expense,
        cumulativeIncome: runningIncome,
        cumulativeExpense: runningExpense,
        incomeArea: runningIncome,
        movements: [...totals.movements].sort((a, b) => b.amount - a.amount),
      };
    });

  return {
    monthLabel: formatMonthLabel(year, month),
    year,
    month,
    points,
    distinctDays: dayBuckets.size,
    datedMovementCount: datedRows.filter((entry) => monthKey(entry.date) === dominantMonthKey).length,
  };
}

export function buildFlowBarData(
  movements: TransactionMovementInput[],
  inflowLabel = 'Ingresos y abonos',
): TransactionFlowBarPoint[] {
  let inflowsTotal = 0;
  let outflowsTotal = 0;
  for (const movement of movements) {
    const amount = Math.abs(Number(movement.amount) || 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    if (movement.direction === 'income') inflowsTotal += amount;
    else outflowsTotal += amount;
  }
  if (inflowsTotal <= 0 && outflowsTotal <= 0) return [];
  return [
    { metric: inflowLabel, value: inflowsTotal },
    { metric: 'Egresos', value: outflowsTotal },
    { metric: 'Flujo neto', value: inflowsTotal - outflowsTotal },
  ];
}

export function buildCategoryBarData(movements: TransactionMovementInput[]): TransactionCategoryBarPoint[] {
  const totals = new Map<string, number>();
  for (const movement of movements) {
    if (movement.direction !== 'expense') continue;
    const amount = Math.abs(Number(movement.amount) || 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const category = String(movement.category || 'Otros').trim() || 'Otros';
    totals.set(category, (totals.get(category) ?? 0) + amount);
  }
  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const grandTotal = sorted.reduce((sum, [, amount]) => sum + amount, 0);
  if (!grandTotal) return [];
  return sorted.map(([category, amount]) => ({
    category,
    amount,
    share: Number(((amount / grandTotal) * 100).toFixed(1)),
  }));
}

export function buildTransactionChartBlocks(
  input: BuildTransactionChartBlocksInput,
): TransactionChartBlock[] {
  const variants = input.variants?.length
    ? input.variants
    : (['cumulative_cashflow', 'flow_bar', 'category_bar'] as TransactionChartVariant[]);
  const currency = input.currency ?? 'CLP';
  const blocks: TransactionChartBlock[] = [];

  if (variants.includes('cumulative_cashflow')) {
    const series = buildCumulativeCashflowSeries(input.movements);
    if (series) {
      blocks.push({
        type: 'tx_chart',
        tx_chart: {
          variant: 'cumulative_cashflow',
          title: 'Evolución acumulada del mes',
          subtitle: `${series.datedMovementCount} movimientos fechados · ${series.distinctDays} días con actividad`,
          currency,
          series,
        },
      });
    }
  }

  if (variants.includes('flow_bar')) {
    const data = buildFlowBarData(input.movements, input.inflowLabel);
    if (data.length > 0) {
      blocks.push({
        type: 'tx_chart',
        tx_chart: {
          variant: 'flow_bar',
          title: 'Flujo financiero',
          subtitle: 'Ingresos, egresos y flujo neto del periodo',
          currency,
          inflowLabel: input.inflowLabel,
          data,
        },
      });
    }
  }

  if (variants.includes('category_bar')) {
    const data = buildCategoryBarData(input.movements);
    if (data.length > 0) {
      blocks.push({
        type: 'tx_chart',
        tx_chart: {
          variant: 'category_bar',
          title: 'Gastos por categoría',
          subtitle: 'Top categorías por monto',
          currency,
          data,
        },
      });
    }
  }

  return blocks;
}

export function shouldBuildCumulativeCashflowChart(movements: TransactionMovementInput[]): boolean {
  return buildCumulativeCashflowSeries(movements) !== null;
}

export function mapDashboardMovementsToTransactionInputs(
  movements: Array<Record<string, unknown>>,
): TransactionMovementInput[] {
  const mapped: TransactionMovementInput[] = [];

  for (const movement of movements) {
    const amount = Math.abs(Number(movement.amount) || 0);
    const directionRaw = String(movement.direction ?? movement.type ?? '').toLowerCase();
    const direction: 'income' | 'expense' =
      directionRaw.includes('income') ||
      directionRaw.includes('ingreso') ||
      directionRaw.includes('abono') ||
      directionRaw.includes('credit')
        ? 'income'
        : 'expense';
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const entry: TransactionMovementInput = { amount, direction };
    if (typeof movement.description === 'string') entry.label = movement.description;
    if (typeof movement.merchant === 'string') {
      entry.merchant = movement.merchant;
    } else if (typeof movement.description === 'string') {
      entry.merchant = movement.description;
    }
    if (typeof movement.date === 'string') entry.date = movement.date;
    if (typeof movement.category === 'string') entry.category = movement.category;
    mapped.push(entry);
  }

  return mapped;
}
