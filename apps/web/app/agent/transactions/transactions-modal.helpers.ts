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
