import { normalizeBudgetRow, type BudgetRow } from '@/lib/budget-rows.helpers';
import {
  aggregateParsedDocuments,
  aggregateUploadedFiles,
  getSimulationSnapshot,
} from '@/lib/products-context.helpers';
import { normalizeProductAssistantState } from '@/lib/product-normalization.helpers';
import { normalizeTransactionTaxonomyOverride } from './transactions/taxonomy';
import type { BankProduct, TransactionTaxonomyOverride } from './transactions/types';
import { hasMeaningfulPanelState } from '@/lib/panel-state.helpers';

export function buildPanelSnapshotPayload(params: {
  budgetRows: BudgetRow[];
  budgetChatAnswers: Array<{ q: string; a: string }>;
  bankSimulation: {
    products: BankProduct[];
    taxonomyOverrides: TransactionTaxonomyOverride[];
    activeProductId: string | null;
    lockedMonth: string | null;
    connected: boolean;
    randomMode: boolean;
  };
  txProductsCreatedTotal: number;
  savedReports: Array<{ id: string; title: string; group: string; fileUrl: string; createdAt: string }>;
}) {
  return {
    budgetRows: params.budgetRows,
    budgetChatAnswers: params.budgetChatAnswers,
    bankSimulation: {
      products: params.bankSimulation.products.map((product) => ({ ...product, randomMode: false })),
      taxonomyOverrides: params.bankSimulation.taxonomyOverrides,
      activeProductId: params.bankSimulation.activeProductId,
      lockedMonth: params.bankSimulation.lockedMonth,
      connected: params.bankSimulation.connected,
      randomMode: params.bankSimulation.randomMode,
      uploadedFiles: aggregateUploadedFiles(params.bankSimulation.products),
      parsedDocuments: aggregateParsedDocuments(params.bankSimulation.products),
    },
    txProductsCreatedTotal: params.txProductsCreatedTotal,
    savedReports: params.savedReports,
    updatedAt: new Date().toISOString(),
  };
}

export function restorePanelStateFromPayload(
  panelState: unknown,
  prev: {
    budgetRows: BudgetRow[];
    budgetChatAnswers: Array<{ q: string; a: string }>;
    savedReports: Array<{ id: string; title: string; fileUrl: string; previewImageUrl?: string; group?: string; createdAt?: string }>;
    txProductsCreatedTotal: number;
    bankSimulation: {
      products: BankProduct[];
      taxonomyOverrides: TransactionTaxonomyOverride[];
      activeProductId: string | null;
      lockedMonth: string | null;
      connected: boolean;
      randomMode: boolean;
      uploadedFiles: string[];
      parsedDocuments: BankProduct['parsedDocuments'];
    };
  }
) {
  if (!hasMeaningfulPanelState(panelState)) return null;
  const p = panelState as Record<string, unknown>;
  const next: Partial<typeof prev> = {};

  if (Array.isArray(p.budgetRows) && p.budgetRows.length > 0) {
    next.budgetRows = p.budgetRows
      .filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null)
      .map((row) =>
        normalizeBudgetRow({
          ...(row as Partial<BudgetRow>),
          note: typeof row.note === 'string' ? row.note : '',
        })
      );
  }
  if (Array.isArray(p.budgetChatAnswers)) {
    next.budgetChatAnswers = (p.budgetChatAnswers as Array<{ q: string; a: string }>)
      .filter((item) => typeof item?.q === 'string' && typeof item?.a === 'string')
      .slice(0, 30);
  }
  if (Array.isArray(p.savedReports)) {
    next.savedReports = p.savedReports;
  }
  if (typeof p.txProductsCreatedTotal === 'number') {
    next.txProductsCreatedTotal = Math.max(0, Math.floor(p.txProductsCreatedTotal));
  }
  if (p.bankSimulation && typeof p.bankSimulation === 'object') {
    const bank = p.bankSimulation as Record<string, unknown>;
    const products: BankProduct[] = Array.isArray(bank.products)
      ? bank.products.map((product: unknown) => {
          const raw = product as Partial<BankProduct>;
          return {
            ...(raw as BankProduct),
            assistant: normalizeProductAssistantState(raw.assistant),
            productType:
              raw.productType === 'debit_account' ||
              raw.productType === 'checking_account' ||
              raw.productType === 'savings_account' ||
              raw.productType === 'consumer_loan' ||
              raw.productType === 'mortgage' ||
              raw.productType === 'investment_account'
                ? raw.productType
                : 'credit_card',
            simulationAccepted: Boolean(raw.simulationAccepted),
            connected: Boolean(raw.connected),
            randomMode: false,
            uploadedFiles: Array.isArray(raw.uploadedFiles) ? raw.uploadedFiles : [],
            parsedDocuments: Array.isArray(raw.parsedDocuments) ? raw.parsedDocuments : [],
          };
        })
      : prev.bankSimulation.products;
    const taxonomyOverrides = Array.isArray(bank.taxonomyOverrides)
      ? (bank.taxonomyOverrides as unknown[])
          .map(normalizeTransactionTaxonomyOverride)
          .filter((item): item is TransactionTaxonomyOverride => Boolean(item))
      : prev.bankSimulation.taxonomyOverrides;
    const requestedActiveProductId =
      typeof bank.activeProductId === 'string' ? bank.activeProductId : prev.bankSimulation.activeProductId;
    const activeProductId =
      requestedActiveProductId && products.some((product) => product.id === requestedActiveProductId)
        ? requestedActiveProductId
        : products[0]?.id ?? null;
    const snapshot = getSimulationSnapshot(products, activeProductId);
    next.bankSimulation = {
      ...prev.bankSimulation,
      products,
      taxonomyOverrides,
      activeProductId,
      lockedMonth: typeof bank.lockedMonth === 'string' ? bank.lockedMonth : prev.bankSimulation.lockedMonth,
      connected: snapshot.connected,
      randomMode: snapshot.randomMode,
      uploadedFiles: snapshot.uploadedFiles,
      parsedDocuments: snapshot.parsedDocuments,
    };
  }
  return next;
}

export function buildMetaSheetContextSummary(sheets: Array<{ name: string; items: Array<{ type: string }> }>) {
  return sheets
    .map((s) => {
      const msgs = s.items
        .filter((it): it is { type: 'message'; role: string; content?: string } => it.type === 'message')
        .slice(-6)
        .map((it) => `[${it.role}]: ${(it.content ?? '').slice(0, 300)}`)
        .join('\n');
      return `=== Hoja "${s.name}" ===\n${msgs}`;
    })
    .join('\n\n');
}
