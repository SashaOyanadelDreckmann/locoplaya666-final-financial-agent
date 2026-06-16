import type {
  ContextArtifactReference,
  ContextConflict,
  ContextManifest,
  ContextManifestSection,
  ContextSourceVersion,
  FinancialContextFact,
} from '@financial-agent/shared';
import {
  buildFinancialFact,
  buildResourceUri,
  dedupeFacts,
  estimateTokensFromJson,
  normalizeMonthlyAmount,
} from '@financial-agent/shared';
import { hashContent, buildSourceVersion, buildContextVersion } from './context-version.service';
import type { ContextSourceBundle } from './context-source.loader';
import {
  readBudgetContext,
  readIntakeQuestionnaire,
  readProductsContext,
} from './context-source.loader';

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function buildFactsFromBundle(bundle: ContextSourceBundle): {
  facts: FinancialContextFact[];
  artifacts: ContextArtifactReference[];
  sourceVersions: ContextSourceVersion[];
} {
  const facts: FinancialContextFact[] = [];
  const artifacts: ContextArtifactReference[] = [];
  const sourceVersions: ContextSourceVersion[] = [];
  const observedAt = bundle.loadedAt;

  const intake = readIntakeQuestionnaire(bundle);
  const intakeHash = hashContent(intake);
  const intakeVersion = buildSourceVersion(intakeHash, observedAt);
  sourceVersions.push({
    sourceKind: 'intake',
    sourceId: 'questionnaire',
    version: intakeVersion,
    contentHash: intakeHash,
    lastModified: observedAt,
  });

  if (typeof intake.incomeBand === 'string' && intake.incomeBand) {
    facts.push(
      buildFinancialFact({
        subject: 'user.income',
        predicate: 'declared_income_band',
        value: intake.incomeBand,
        sourceKind: 'intake',
        sourceId: 'questionnaire',
        sourceVersion: intakeVersion,
        contentHash: intakeHash,
        unit: 'text',
        cadence: 'monthly',
        confidence: 0.85,
        userConfirmed: true,
        observedAt,
      }),
    );
  }
  const exactIncome = toNumber(intake.exactMonthlyIncome);
  if (exactIncome !== null && exactIncome > 0) {
    facts.push(
      buildFinancialFact({
        subject: 'user.income',
        predicate: 'declared_monthly_income',
        value: exactIncome,
        sourceKind: 'intake',
        sourceId: 'questionnaire',
        sourceVersion: intakeVersion,
        contentHash: intakeHash,
        unit: 'CLP',
        cadence: 'monthly',
        confidence: 0.9,
        userConfirmed: true,
        observedAt,
      }),
    );
  }
  if (typeof intake.hasDebt === 'boolean') {
    facts.push(
      buildFinancialFact({
        subject: 'user.debt',
        predicate: 'declared_has_debt',
        value: intake.hasDebt,
        sourceKind: 'intake',
        sourceId: 'questionnaire',
        sourceVersion: intakeVersion,
        contentHash: intakeHash,
        unit: 'text',
        confidence: 0.85,
        userConfirmed: true,
        observedAt,
      }),
    );
  }

  const budget = readBudgetContext(bundle);
  const budgetHash = hashContent(budget);
  const budgetVersion = buildSourceVersion(budgetHash, observedAt);
  sourceVersions.push({
    sourceKind: 'budget',
    sourceId: 'panel',
    version: budgetVersion,
    contentHash: budgetHash,
    lastModified: observedAt,
    recordCount: Array.isArray(budget.rows) ? budget.rows.length : undefined,
  });

  const budgetIncome = toNumber(budget.income);
  const budgetExpenses = toNumber(budget.expenses);
  const budgetBalance = toNumber(budget.balance);
  if (budgetIncome !== null) {
    facts.push(
      buildFinancialFact({
        subject: 'budget.totals',
        predicate: 'monthly_income',
        value: budgetIncome,
        sourceKind: 'budget',
        sourceId: 'panel',
        sourceVersion: budgetVersion,
        contentHash: budgetHash,
        unit: 'CLP',
        cadence: 'monthly',
        confidence: 0.95,
        observedAt,
      }),
    );
  }
  if (budgetExpenses !== null) {
    facts.push(
      buildFinancialFact({
        subject: 'budget.totals',
        predicate: 'monthly_expenses',
        value: budgetExpenses,
        sourceKind: 'budget',
        sourceId: 'panel',
        sourceVersion: budgetVersion,
        contentHash: budgetHash,
        unit: 'CLP',
        cadence: 'monthly',
        confidence: 0.95,
        observedAt,
      }),
    );
  }
  if (budgetBalance !== null) {
    facts.push(
      buildFinancialFact({
        subject: 'budget.totals',
        predicate: 'monthly_balance',
        value: budgetBalance,
        sourceKind: 'budget',
        sourceId: 'panel',
        sourceVersion: budgetVersion,
        contentHash: budgetHash,
        unit: 'CLP',
        cadence: 'monthly',
        confidence: 0.95,
        observedAt,
      }),
    );
  }

  const products = readProductsContext(bundle);
  const productsHash = hashContent(products);
  const productsVersion = buildSourceVersion(productsHash, observedAt);
  sourceVersions.push({
    sourceKind: 'transaction',
    sourceId: 'products',
    version: productsVersion,
    contentHash: productsHash,
    lastModified: observedAt,
    recordCount: toNumber(products.productsCount) ?? undefined,
  });

  const txSummary =
    products.transactionSummary && typeof products.transactionSummary === 'object'
      ? (products.transactionSummary as Record<string, unknown>)
      : {};
  const txInflows = toNumber(txSummary.inflowsTotal);
  const txOutflows = toNumber(txSummary.outflowsTotal);
  if (txInflows !== null) {
    facts.push(
      buildFinancialFact({
        subject: 'transactions.summary',
        predicate: 'observed_inflows',
        value: txInflows,
        sourceKind: 'transaction',
        sourceId: 'products',
        sourceVersion: productsVersion,
        contentHash: productsHash,
        unit: 'CLP',
        cadence: 'monthly',
        confidence: 0.75,
        derived: true,
        observedAt,
      }),
    );
  }
  if (txOutflows !== null) {
    facts.push(
      buildFinancialFact({
        subject: 'transactions.summary',
        predicate: 'observed_outflows',
        value: txOutflows,
        sourceKind: 'transaction',
        sourceId: 'products',
        sourceVersion: productsVersion,
        contentHash: productsHash,
        unit: 'CLP',
        cadence: 'monthly',
        confidence: 0.75,
        derived: true,
        observedAt,
      }),
    );
  }

  if (bundle.diagnosticProfile?.diagnosticNarrative) {
    const diagnosticId = hashContent(bundle.diagnosticProfile.diagnosticNarrative).slice(0, 12);
    const diagnosticCompletedAt = bundle.diagnosticProfile.meta?.completedAt ?? observedAt;
    const diagnosticHash = hashContent({
      narrative: bundle.diagnosticProfile.diagnosticNarrative.slice(0, 200),
      completedAt: diagnosticCompletedAt,
    });
    const diagnosticVersion = buildSourceVersion(diagnosticHash, diagnosticCompletedAt);
    sourceVersions.push({
      sourceKind: 'diagnostic',
      sourceId: diagnosticId,
      version: diagnosticVersion,
      contentHash: diagnosticHash,
      lastModified: diagnosticCompletedAt,
    });
    facts.push(
      buildFinancialFact({
        subject: 'diagnostic.profile',
        predicate: 'completed',
        value: true,
        sourceKind: 'diagnostic',
        sourceId: diagnosticId,
        sourceVersion: diagnosticVersion,
        contentHash: diagnosticHash,
        confidence: 1,
        userConfirmed: true,
        observedAt: diagnosticCompletedAt,
      }),
    );
    artifacts.push({
      artifactId: diagnosticId,
      uri: buildResourceUri('diagnostic'),
      kind: 'profile',
      label: 'Perfil diagnóstico',
      sourceKind: 'diagnostic',
      sourceVersion: diagnosticVersion,
      contentHash: diagnosticHash,
    });
  }

  if (bundle.socialReflections?.answers?.length) {
    const socialHash = hashContent(bundle.socialReflections);
    const socialVersion = buildSourceVersion(socialHash, bundle.socialReflections.updatedAt);
    sourceVersions.push({
      sourceKind: 'social_reflection',
      sourceId: 'session',
      version: socialVersion,
      contentHash: socialHash,
      lastModified: bundle.socialReflections.updatedAt ?? observedAt,
      recordCount: bundle.socialReflections.answers.length,
    });
  }

  const lifecycleHash = hashContent(bundle.lifecycle);
  sourceVersions.push({
    sourceKind: 'deterministic_derivation',
    sourceId: 'lifecycle',
    version: buildSourceVersion(lifecycleHash, bundle.lifecycle.updatedAt),
    contentHash: lifecycleHash,
    lastModified: bundle.lifecycle.updatedAt,
  });

  return {
    facts: dedupeFacts(facts),
    artifacts,
    sourceVersions,
  };
}

export function buildSectionSummaries(bundle: ContextSourceBundle): Record<string, unknown> {
  const intake = readIntakeQuestionnaire(bundle);
  const budget = readBudgetContext(bundle);
  const products = readProductsContext(bundle);
  return {
    intake: {
      employmentStatus: intake.employmentStatus ?? null,
      incomeBand: intake.incomeBand ?? null,
      hasDebt: intake.hasDebt ?? null,
    },
    budget: {
      income: toNumber(budget.income),
      expenses: toNumber(budget.expenses),
      balance: toNumber(budget.balance),
      rowsCount: Array.isArray(budget.rows)
        ? budget.rows.filter((row) => Number((row as { amount?: number }).amount ?? 0) > 0).length
        : toNumber(budget.rowsCount),
    },
    transactions: {
      productsCount: toNumber(products.productsCount) ?? 0,
      activeProductLabel: products.activeProductLabel ?? null,
    },
    lifecycle: {
      phase: bundle.lifecycle.phase,
      unlockedChats: bundle.lifecycle.unlockedChats,
    },
  };
}

export function buildManifestFromBundle(
  bundle: ContextSourceBundle,
  conflictCount = 0,
): ContextManifest {
  const generatedAt = bundle.loadedAt;
  const summaries = buildSectionSummaries(bundle);
  const { sourceVersions } = buildFactsFromBundle(bundle);

  const sectionDefs: Array<{ name: ContextManifestSection['name']; payload: unknown; uri: string }> = [
    { name: 'intake', payload: summaries.intake, uri: buildResourceUri('intake') },
    { name: 'budget', payload: summaries.budget, uri: buildResourceUri('budget', 'summary') },
    { name: 'transactions', payload: summaries.transactions, uri: buildResourceUri('transactions', 'summary') },
    { name: 'diagnostic', payload: bundle.diagnosticProfile ? { completed: true } : { completed: false }, uri: buildResourceUri('diagnostic') },
    { name: 'social_reflections', payload: bundle.socialReflections?.answers?.length ?? 0, uri: buildResourceUri('social_reflections') },
    { name: 'lifecycle', payload: summaries.lifecycle, uri: buildResourceUri('lifecycle') },
  ];

  const versionByKind = new Map(sourceVersions.map((entry) => [entry.sourceKind, entry]));
  const sections: ContextManifestSection[] = sectionDefs.map((def) => {
    const hash = hashContent(def.payload);
    const fullTokens = estimateTokensFromJson(def.payload);
    const source =
      def.name === 'intake'
        ? versionByKind.get('intake')
        : def.name === 'budget'
          ? versionByKind.get('budget')
          : def.name === 'transactions'
            ? versionByKind.get('transaction')
            : def.name === 'diagnostic'
              ? versionByKind.get('diagnostic')
              : def.name === 'social_reflections'
                ? versionByKind.get('social_reflection')
                : versionByKind.get('deterministic_derivation');
    return {
      name: def.name,
      version: source?.version ?? buildSourceVersion(hash, generatedAt),
      contentHash: hash,
      lastModified: source?.lastModified ?? generatedAt,
      available: def.payload !== null && def.payload !== undefined,
      summaryTokensEstimate: Math.max(8, Math.ceil(fullTokens * 0.35)),
      fullTokensEstimate: fullTokens,
      conflictCount: def.name === 'budget' || def.name === 'intake' ? conflictCount : 0,
      resourceUri: def.uri,
    };
  });

  const sectionHashes = Object.fromEntries(sections.map((section) => [section.name, section.contentHash]));

  return {
    contextVersion: buildContextVersion(sectionHashes),
    generatedAt,
    sections,
    activeConflicts: conflictCount,
    lifecycle: {
      activeChat: bundle.lifecycle.unlockedChats.at(-1) ?? 'chat-1',
      diagnosisCompleted: bundle.lifecycle.phase === 'advisory_unlocked',
      interviewStatus: bundle.lifecycle.phase,
    },
  };
}

export { normalizeMonthlyAmount };
