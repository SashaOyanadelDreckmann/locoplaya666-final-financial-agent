export type TxWizardStep = 'products' | 'credentials' | 'upload' | 'dashboard';

type TxProductSlice = {
  connected?: boolean;
  parsedDocuments?: unknown[];
  dashboard?: {
    keyMetrics?: { movement_count?: number };
    movements?: unknown[];
  };
};

/** Wizard step derived from product lifecycle — single source of truth for page + modal. */
export function resolveTxWizardStep(product: TxProductSlice | null | undefined): TxWizardStep {
  if (!product) return 'products';
  if (!product.connected) return 'credentials';
  if ((product.parsedDocuments?.length ?? 0) === 0) return 'upload';
  return 'dashboard';
}

/** True when OCR/parsing produced documents and at least one movement was detected. */
export function productHasAnalyzedMovements(product: TxProductSlice): boolean {
  if ((product.parsedDocuments?.length ?? 0) === 0) return false;
  const movementCount = Math.max(0, Number(product.dashboard?.keyMetrics?.movement_count ?? 0) || 0);
  if (movementCount > 0) return true;
  return (product.dashboard?.movements?.length ?? 0) > 0;
}

export function productsHaveAnalyzedMovements(products: TxProductSlice[]): boolean {
  return products.some(productHasAnalyzedMovements);
}

export function countProductsWithAnalyzedMovements(products: TxProductSlice[]): number {
  return products.filter(productHasAnalyzedMovements).length;
}
