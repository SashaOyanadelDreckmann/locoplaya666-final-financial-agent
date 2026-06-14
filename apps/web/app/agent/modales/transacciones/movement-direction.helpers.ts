export function resolveSignedAmount(input: {
  amount: number;
  amountSigned?: number;
  direction?: 'income' | 'expense';
}): number {
  if (Number.isFinite(Number(input.amountSigned))) {
    return Number(input.amountSigned);
  }
  const absolute = Math.abs(Number(input.amount) || 0);
  return input.direction === 'expense' ? -absolute : absolute;
}

export function resolveMovementDirectionForTotals(input: {
  apiDirection?: 'income' | 'expense';
  movementKind?: 'income' | 'expense' | 'abono';
  signedAmount: number;
  isCreditCardProduct: boolean;
}): 'income' | 'expense' {
  if (input.apiDirection === 'income' || input.apiDirection === 'expense') {
    return input.apiDirection;
  }
  if (input.movementKind === 'abono' || input.movementKind === 'income') {
    return 'income';
  }
  if (input.movementKind === 'expense') {
    return 'expense';
  }
  if (input.isCreditCardProduct) {
    return input.signedAmount < 0 ? 'income' : 'expense';
  }
  return input.signedAmount < 0 ? 'expense' : 'income';
}

export function resolveMovementKind(input: {
  apiKind?: 'income' | 'expense' | 'abono';
  directionForTotals: 'income' | 'expense';
  signedAmount: number;
  isCreditCardProduct: boolean;
}): 'income' | 'expense' | 'abono' {
  if (input.apiKind === 'abono' || input.apiKind === 'income' || input.apiKind === 'expense') {
    return input.apiKind;
  }
  if (input.directionForTotals === 'income' && input.isCreditCardProduct && input.signedAmount < 0) {
    return 'abono';
  }
  return input.directionForTotals;
}
