import type { UserRole } from '../auth/rbac';
import type { FinancialDiagnosticProfile } from '../schemas/profile.schema';

export type StoredSheet = {
  id: string;
  name: string;
  autoNamed: boolean;
  items: unknown[];
  draft: string;
  status: 'active' | 'context';
  contextScore: number;
  userMessageCount: number;
  createdAt: string;
  completedAt?: string;
};

export type StoredReport = {
  id: string;
  title: string;
  group: 'plan_action' | 'simulation' | 'budget' | 'diagnosis' | 'other';
  fileUrl: string;
  createdAt: string;
};

export type StoredUploadedDocument = {
  name: string;
  text: string;
};

export type StoredPanelState = {
  budgetRows: Array<{
    id: string;
    category: string;
    type: 'income' | 'expense';
    amount: number;
    note: string;
  }>;
  bankSimulation: {
    username: string;
    connected: boolean;
    randomMode: boolean;
    uploadedFiles: string[];
    parsedDocuments: StoredUploadedDocument[];
  };
  savedReports: StoredReport[];
  updatedAt: string;
};

export type StoredKnowledgeEvent = {
  timestamp: string;
  action: string;
  points: number;
  rationale: string;
  context?: Record<string, unknown>;
};

export type StoredUser = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  injectedProfile?: FinancialDiagnosticProfile;
  injectedIntake?: {
    intake: unknown;
    llmSummary?: unknown;
    intakeContext?: unknown;
  };
  latestDiagnosticProfileId?: string;
  latestDiagnosticCompletedAt?: string;
  panelState?: StoredPanelState;
  sheets?: StoredSheet[];
  knowledgeBaseScore: number;
  knowledgeScore: number;
  knowledgeHistory: StoredKnowledgeEvent[];
  knowledgeLastUpdated: string;
  memoryBlob?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type StoredSession = {
  token: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
};

export type StoredProfile = {
  id: string;
  userId: string;
  payload: FinancialDiagnosticProfile;
  createdAt: string;
};
