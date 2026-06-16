export type ContextSourceKind =
  | 'intake'
  | 'budget'
  | 'transaction'
  | 'document'
  | 'diagnostic'
  | 'interview'
  | 'social_reflection'
  | 'user_correction'
  | 'agent_memory'
  | 'deterministic_derivation'
  | 'llm_inference'
  | 'ui_ephemeral';

export type ContextUnit = 'CLP' | 'USD' | 'UF' | 'UTM' | 'percent' | 'count' | 'text';

export type ContextCadence = 'daily' | 'weekly' | 'monthly' | 'annual' | 'one_time';

export interface FinancialContextFact<T = unknown> {
  factId: string;
  subject: string;
  predicate: string;
  value: T;
  unit?: ContextUnit;
  cadence?: ContextCadence;
  periodStart?: string;
  periodEnd?: string;
  sourceKind: ContextSourceKind;
  sourceId: string;
  sourceVersion: string;
  observedAt: string;
  effectiveAt?: string;
  expiresAt?: string;
  confidence: number;
  userConfirmed: boolean;
  derived: boolean;
  contentHash: string;
  supersedesFactId?: string;
  metadata?: Record<string, unknown>;
}

export interface ContextArtifactReference {
  artifactId: string;
  uri: string;
  kind: 'document' | 'movement' | 'budget_row' | 'transcript' | 'summary' | 'profile';
  label: string;
  sourceKind: ContextSourceKind;
  sourceVersion: string;
  contentHash: string;
  byteEstimate?: number;
  hasMore?: boolean;
}

export interface ContextSourceVersion {
  sourceKind: ContextSourceKind;
  sourceId: string;
  version: string;
  contentHash: string;
  lastModified: string;
  recordCount?: number;
}

export interface ContextManifestSection {
  name: string;
  version: string;
  contentHash: string;
  lastModified: string;
  available: boolean;
  summaryTokensEstimate: number;
  fullTokensEstimate: number;
  conflictCount: number;
  resourceUri: string;
}

export interface ContextManifest {
  contextVersion: string;
  generatedAt: string;
  sections: ContextManifestSection[];
  activeConflicts: number;
  lifecycle: {
    activeChat: string;
    diagnosisCompleted: boolean;
    interviewStatus: string;
  };
}

export type ContextPackConsumer =
  | 'core-agent'
  | 'budget-agent'
  | 'transactions-agent'
  | 'diagnostic-agent'
  | 'interview-agent';

export type ContextPackPurpose =
  | 'classify'
  | 'answer'
  | 'budget_analysis'
  | 'transaction_analysis'
  | 'diagnosis'
  | 'planning'
  | 'simulation'
  | 'regulation'
  | 'social_reflection';

export interface BuildContextPackInput {
  consumer: ContextPackConsumer;
  purpose: ContextPackPurpose;
  activeChat?: 'chat-1' | 'chat-2' | 'chat-3';
  userMessage?: string;
  reasoningMode?: string;
  maxInputTokens: number;
  knownContextVersion?: string;
  requiredSections?: string[];
  optionalSections?: string[];
}

export interface ContextPack {
  contextVersion: string;
  packVersion: string;
  generatedAt: string;
  facts: FinancialContextFact[];
  deterministicSummaries: Record<string, unknown>;
  activeConflicts: ContextConflict[];
  evidenceReferences: ContextArtifactReference[];
  includedSections: string[];
  omittedSections: string[];
  resourceUris: string[];
  tokenEstimate: number;
  cacheStatus: 'hit' | 'miss' | 'partial';
  sourceVersions: Record<string, string>;
  omitted?: boolean;
  hasMore?: boolean;
}

export type ContextConflictType =
  | 'hard_value_conflict'
  | 'soft_value_mismatch'
  | 'temporal_change'
  | 'unit_mismatch'
  | 'cadence_mismatch'
  | 'missing_evidence'
  | 'stale_source'
  | 'derived_source_disagreement'
  | 'user_correction_pending'
  | 'duplicate_source'
  | 'lifecycle_inconsistency';

export type ContextConflictSeverity = 'info' | 'low' | 'medium' | 'high';

export type ContextConflictStatus = 'open' | 'acknowledged' | 'resolved' | 'dismissed';

export type ContextConflictResolution =
  | 'ask_user'
  | 'refresh_source'
  | 'normalize_unit'
  | 'accept_temporal_change'
  | 'manual_review'
  | 'no_action';

export interface ContextConflict {
  conflictId: string;
  type: ContextConflictType;
  severity: ContextConflictSeverity;
  status: ContextConflictStatus;
  predicate: string;
  factIds: string[];
  sourceIds: string[];
  explanationCode: string;
  deterministicReason: string;
  detectedAt: string;
  contextVersion: string;
  suggestedResolution: ContextConflictResolution;
  autoResolvable: boolean;
}

export interface ContextSnapshot {
  contextVersion: string;
  generatedAt: string;
  manifest: ContextManifest;
  sourceVersions: ContextSourceVersion[];
}

export interface ContextDelta {
  fromVersion: string;
  toVersion: string;
  changedSections: string[];
  addedFacts: string[];
  removedFactIds: string[];
  newConflicts: string[];
  resolvedConflictIds: string[];
}

/** Session API payload: `GET /api/session` → `contextFabric`. */
export interface ContextFabricSessionSnapshot {
  contextVersion: string;
  activeConflictCount: number;
  lifecycle: ContextManifest['lifecycle'];
  conflicts?: ContextConflict[];
}
