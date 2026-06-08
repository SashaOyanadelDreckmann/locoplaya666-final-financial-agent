import { confidenceBandLong, formatPercentCompact } from './presentation';

export const TX_CARD_LIKE_TYPES = [
  'credit_card',
  'debit_account',
  'checking_account',
  'savings_account',
] as const;

export type TxCardLikeType = (typeof TX_CARD_LIKE_TYPES)[number];

export function isCardLikeType(value: string): value is TxCardLikeType {
  return (TX_CARD_LIKE_TYPES as readonly string[]).includes(value);
}

export const RECOMMENDED_TX_PRODUCTS = [
  { title: 'Tarjeta de crédito', bank: 'Banco BICE', template: 'Tarjeta de crédito' },
  { title: 'Cuenta corriente', bank: 'Banco de Chile', template: 'Cuenta corriente' },
  { title: 'Cuenta vista', bank: 'BancoEstado', template: 'Cuenta vista' },
] as const;

export type MovementHeatKind = 'income' | 'expense';

export type MovementRowHeatVars = {
  '--row-bg': string;
};

/** Max absolute amount for heat-map normalization (matches budget table logic). */
export function maxMovementHeatAmount(amounts: number[]): number {
  const values = amounts
    .map((value) => Math.abs(Number(value) || 0))
    .filter((value) => value > 0);
  return values.length > 0 ? Math.max(...values) : 1;
}

/** Row background intensity: higher amounts → stronger red (expense) or green (income). */
export function movementTableRowHeatStyle(
  amount: number,
  kind: MovementHeatKind,
  maxAmount: number,
): MovementRowHeatVars {
  const normalized = Math.abs(Number(amount) || 0);
  const cap = Math.max(1, maxAmount);
  const t = Math.max(0, Math.min(1, normalized / cap));
  const alpha = kind === 'expense' ? 0.16 + t * 0.6 : 0.14 + t * 0.56;
  const bg =
    kind === 'expense'
      ? `rgba(118, 26, 36, ${alpha.toFixed(2)})`
      : `rgba(62, 84, 22, ${alpha.toFixed(2)})`;
  return { '--row-bg': bg };
}

export function movementRowHeatClass(kind: MovementHeatKind): string {
  return kind === 'expense' ? 'tx-row-expense' : 'tx-row-income';
}

export function buildMovementRefinementText(movement: {
  label: string;
  merchant?: string;
  category?: string;
  amount: number;
  date?: string;
  categoryConfidence?: number;
}, formatCurrency: (value: number) => string) {
  return [
    `Movimiento: ${movement.label}`,
    movement.merchant ? `Comercio detectado: ${movement.merchant}` : null,
    movement.category ? `Categoría actual: ${movement.category}` : null,
    movement.date ? `Fecha: ${movement.date}` : null,
    `Monto: ${formatCurrency(movement.amount)}`,
    movement.categoryConfidence !== undefined
      ? `Confianza categorización: ${formatPercentCompact(movement.categoryConfidence * 100)} (${confidenceBandLong(movement.categoryConfidence)})`
      : null,
  ]
    .filter(Boolean)
    .join('. ');
}
