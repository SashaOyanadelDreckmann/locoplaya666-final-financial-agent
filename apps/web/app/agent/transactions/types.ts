export type TxWizardStep = 'products' | 'credentials' | 'upload' | 'dashboard';
export type TxUploadOnboardingStep = 'format' | 'details' | 'upload';
export type BankProduct = {
  id: string; label: string; bank: string; simulationAccepted: boolean; connected: boolean; randomMode: boolean;
  assistant?: {
    messages: Array<{
      id: string;
      role: 'assistant' | 'user';
      text: string;
      createdAt: string;
      attachments?: string[];
    }>;
    uploadFormat?: 'photos' | 'pdf' | 'spreadsheet' | 'text' | 'video' | null;
    summaryText?: string | null;
    summaryModel?: string | null;
    summaryGeneratedAt?: string | null;
    summaryRegenerationsUsed?: number;
    lastSummaryFeedback?: string | null;
  };
  productType: 'credit_card' | 'debit_account' | 'checking_account' | 'savings_account' | 'consumer_loan' | 'mortgage' | 'investment_account';
  uploadedFiles: string[];
  parsedDocuments: Array<{
    documentId?: string;
    name: string;
    text: string;
    summary?: unknown;
    structuredData?: unknown;
    insight?: {
      format?: string;
      reliability?: number;
      extracted_rows?: number;
      key_findings?: string[];
    };
  }>;
    dashboard?: {
      period?: { from?: string; to?: string };
      currency?: string;
      keyMetrics?: {
        inflows_total: number;
        abonos_total?: number;
        outflows_total: number;
        net_flow: number;
        avg_movement: number;
      movement_count: number;
      median_movement?: number;
      p90_movement?: number;
      max_income?: number;
      max_expense?: number;
      expense_to_income_ratio?: number;
      table_rows_processed?: number;
      movement_coverage_pct?: number;
      table_rows_verified?: number;
      high_confidence_movement_count?: number;
      avg_category_confidence?: number;
    };
    topCategories?: Array<{ name: string; amount: number }>;
    topMerchants?: Array<{ merchant: string; category: string; amount: number; tx_count: number }>;
    categoryExamples?: Array<{ name: string; amount: number; examples: string[] }>;
    spendClusters?: Array<{
      name: string;
      amount: number;
      tx_count: number;
      avg_ticket: number;
      share_pct: number;
      examples: string[];
    }>;
    topExpenses?: Array<{ label: string; amount: number; date?: string }>;
    topIncome?: Array<{ label: string; amount: number; date?: string }>;
    alerts?: string[];
    alertDetails?: Array<{ title: string; severity: 'high' | 'medium' | 'low'; reason: string }>;
    opportunities?: string[];
    metricExplanations?: Array<{ metric: string; value: string; explanation: string }>;
    movements?: Array<{
      date?: string;
      description: string;
      amount: number;
      direction: 'expense' | 'income';
      movement_kind?: 'expense' | 'income' | 'abono';
      source_line?: string;
      category?: string;
      merchant?: string;
      category_confidence?: number;
      confidence?: number;
      source_kind?: 'table' | 'line';
    }>;
    summary?: string;
  };
};

export type TransactionTaxonomyOverride = {
  id: string;
  matchKey: string;
  matchLabel: string;
  merchant: string;
  category: string;
  updatedAt: string;
};

export type UploadStatementResult = {
  documents: Array<{
    documentId?: string;
    name: string;
    text: string;
    summary?: unknown;
    structuredData?: unknown;
    insight?: {
      format?: string;
      reliability?: number;
      extracted_rows?: number;
      key_findings?: string[];
    };
  }>;
  dashboard?: BankProduct['dashboard'];
  product: {
    bank: string;
    label: string;
    productType: BankProduct['productType'];
  };
};

export type TransactionsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  txWizardStep: TxWizardStep;
  setTxWizardStep: (step: TxWizardStep) => void;
  bankSimulationProductsCount: number;
  transactionIntel: { docs: number; amounts: number[]; summary: string; topKeywords: Array<{ label: string; count: number }>; averageDetected: number; maxDetected: number; totalDetected: number; rows: number };
  activeBankProduct: BankProduct | null;
  transactionProductCards: Array<{ product: BankProduct; descriptor: { title: string; description: string; insights: string[]; themeColor: string }; intel: { docs: number; amounts: number[] } }>;
  selectedProductId: string | null;
  selectTransactionProduct: (id: string) => void;
  deleteTransactionProduct: (id: string) => void;
  addTransactionProduct: (seed?: Partial<BankProduct>) => void;
  updateActiveProduct: (patch: Partial<BankProduct>) => void;
  updateProductById: (productId: string, patch: Partial<BankProduct>) => void;
  transactionTaxonomyOverrides: TransactionTaxonomyOverride[];
  upsertTransactionTaxonomyOverride: (override: TransactionTaxonomyOverride) => void;
  removeTransactionTaxonomyOverride: (matchKey: string) => void;
  simulateBankLogin: (config?: {
    bank?: string;
    label?: string;
    productType?: BankProduct['productType'];
    simulationAccepted?: boolean;
  }) => void;
  onUploadStatement: (files: File[] | FileList | null) => Promise<UploadStatementResult | null>;
  documentsLoading: boolean;
  documentsParseProgress?: import('@/lib/transactions-parse-progress.helpers').DocumentsParseProgress | null;
  onDocumentsParseProgress?: (
    progress: import('@/lib/transactions-parse-progress.helpers').DocumentsParseProgress,
  ) => void;
  transactionUploadError?: string | null;
  saveTransactionProductForBatch: () => void;
  savedProductIds: string[];
  maxProducts: number;
  maxEvidenceFilesPerProduct: number;
  productsCreatedTotal: number;
  creationNotice?: string | null;
};
