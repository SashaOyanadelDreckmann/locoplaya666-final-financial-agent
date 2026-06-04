import type { BankProduct } from '@/app/agent/transactions/types';

type ParsedBankDocument = BankProduct['parsedDocuments'][number];

type CanonicalMovement = NonNullable<NonNullable<BankProduct['dashboard']>['movements']>[number];

export function aggregateParsedDocuments(products: BankProduct[]): ParsedBankDocument[] {
  const docsByKey = new Map<string, ParsedBankDocument>();
  for (const product of products) {
    for (const doc of product.parsedDocuments ?? []) {
      const key = `${product.id}:${doc.name}`;
      docsByKey.set(key, doc);
    }
  }
  return Array.from(docsByKey.values());
}

export function aggregateUploadedFiles(products: BankProduct[]): string[] {
  return Array.from(new Set(products.flatMap((product) => product.uploadedFiles ?? [])));
}

export function aggregateCanonicalMovements(products: BankProduct[]): CanonicalMovement[] {
  const dedup = new Map<string, CanonicalMovement>();
  for (const product of products) {
    for (const movement of product.dashboard?.movements ?? []) {
      const key = [
        movement.direction,
        String(movement.date ?? ''),
        String(movement.description ?? '')
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, ''),
        Math.round(Number(movement.amount) || 0),
      ].join('|');
      if (!dedup.has(key)) dedup.set(key, movement);
    }
  }
  return Array.from(dedup.values());
}

export function buildScopedTransactionsContext(products: BankProduct[], activeProductId: string | null) {
  const activeProduct = activeProductId
    ? products.find((product) => product.id === activeProductId) ?? null
    : null;

  const productsIndex = products.slice(0, 20).map((product) => ({
    id: product.id,
    label: product.label,
    bank: product.bank,
    productType: product.productType,
    connected: product.connected,
    uploadedFilesCount: product.uploadedFiles?.length ?? 0,
    parsedDocumentsCount: product.parsedDocuments?.length ?? 0,
    movementCount: product.dashboard?.keyMetrics?.movement_count ?? 0,
    inflowsTotal: product.dashboard?.keyMetrics?.inflows_total ?? 0,
    outflowsTotal: product.dashboard?.keyMetrics?.outflows_total ?? 0,
    netFlow: product.dashboard?.keyMetrics?.net_flow ?? 0,
  }));

  return {
    activeProduct,
    productsIndex,
    scopedUploadedDocuments: (activeProduct?.parsedDocuments ?? []).slice(-3),
    scopedUploadedEvidenceFiles: (activeProduct?.uploadedFiles ?? []).slice(-6),
  };
}

export function buildPersistableProductsContext(products: BankProduct[], activeProductId: string | null) {
  const activeProduct = activeProductId
    ? products.find((product) => product.id === activeProductId) ?? null
    : products.find((product) => product.connected) ?? products[0] ?? null;
  const allMovements = aggregateCanonicalMovements(products);
  const uploadedFiles = aggregateUploadedFiles(products).slice(0, 50);
  const productsPayload = products.slice(0, 20).map((product) => ({
    id: product.id,
    label: product.label,
    bank: product.bank,
    productType: product.productType,
    connected: product.connected,
    assistantSummary: product.assistant?.summaryText ?? null,
    dashboardSummary: product.dashboard?.summary,
    period: product.dashboard?.period,
    keyMetrics: product.dashboard?.keyMetrics,
    parsedDocuments: (product.parsedDocuments ?? []).slice(0, 4).map((doc) => ({
      documentId: (doc as { documentId?: string }).documentId,
      name: doc.name,
      text: String(doc.text ?? '').slice(0, 900),
      summary: doc.summary,
      structuredData: doc.structuredData,
      insight: doc.insight,
    })),
    documentPreviews: (product.parsedDocuments ?? []).slice(0, 4).map((doc) => ({
      documentId: (doc as { documentId?: string }).documentId,
      name: doc.name,
      text: String(doc.text ?? '').slice(0, 900),
    })),
    topCategories: product.dashboard?.topCategories?.slice(0, 10),
    topIncome: product.dashboard?.topIncome?.slice(0, 10),
    topExpenses: product.dashboard?.topExpenses?.slice(0, 10),
    alerts: product.dashboard?.alerts?.slice(0, 10),
    movements: product.dashboard?.movements?.slice(0, 80) ?? [],
  }));
  const topCategories = products
    .flatMap((product) => product.dashboard?.topCategories ?? [])
    .reduce<Array<{ name: string; amount: number }>>((acc, category) => {
      const existing = acc.find((item) => item.name.toLowerCase() === category.name.toLowerCase());
      if (existing) existing.amount += Math.max(0, Number(category.amount) || 0);
      else acc.push({ name: category.name, amount: Math.max(0, Number(category.amount) || 0) });
      return acc;
    }, [])
    .sort((left, right) => right.amount - left.amount)
    .slice(0, 12);
  const alerts = Array.from(
    new Set(products.flatMap((product) => product.dashboard?.alerts ?? []).filter(Boolean)),
  ).slice(0, 12);
  const inflowsTotal = products.reduce(
    (sum, product) => sum + Math.max(0, Number(product.dashboard?.keyMetrics?.inflows_total ?? 0) || 0),
    0,
  );
  const outflowsTotal = products.reduce(
    (sum, product) => sum + Math.max(0, Number(product.dashboard?.keyMetrics?.outflows_total ?? 0) || 0),
    0,
  );
  const movementCount = products.reduce(
    (sum, product) => sum + Math.max(0, Number(product.dashboard?.keyMetrics?.movement_count ?? 0) || 0),
    0,
  );

  return {
    scope: 'all_products' as const,
    activeProductId: activeProduct?.id ?? null,
    activeProductLabel: activeProduct?.label,
    productsCount: products.length,
    uploadedFiles,
    activeProduct: productsPayload.find((product) => product.id === activeProduct?.id),
    productsIndex: products.slice(0, 20).map((product) => ({
      id: product.id,
      label: product.label,
      bank: product.bank,
      productType: product.productType,
      connected: product.connected,
      uploadedFilesCount: product.uploadedFiles?.length ?? 0,
      parsedDocumentsCount: product.parsedDocuments?.length ?? 0,
      movementCount: product.dashboard?.keyMetrics?.movement_count ?? 0,
      inflowsTotal: product.dashboard?.keyMetrics?.inflows_total ?? 0,
      outflowsTotal: product.dashboard?.keyMetrics?.outflows_total ?? 0,
      netFlow: product.dashboard?.keyMetrics?.net_flow ?? 0,
    })),
    products: productsPayload,
    transactionSummary: {
      inflowsTotal: Math.round(inflowsTotal),
      outflowsTotal: Math.round(outflowsTotal),
      netFlow: Math.round(inflowsTotal - outflowsTotal),
      movementCount: Math.round(movementCount || allMovements.length),
      topCategories,
      alerts,
    },
  };
}

export function getSimulationSnapshot(products: BankProduct[], activeProductId: string | null) {
  const activeProduct = activeProductId
    ? products.find((product) => product.id === activeProductId) ?? null
    : null;

  return {
    activeProduct,
    connected: Boolean(activeProduct?.connected),
    randomMode: Boolean(activeProduct?.randomMode),
    uploadedFiles: activeProduct?.uploadedFiles ?? [],
    parsedDocuments: activeProduct?.parsedDocuments ?? [],
    aggregateUploadedFiles: aggregateUploadedFiles(products),
    aggregateParsedDocuments: aggregateParsedDocuments(products),
  };
}
