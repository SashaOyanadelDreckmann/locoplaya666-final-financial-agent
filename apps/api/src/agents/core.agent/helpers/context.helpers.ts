/**
 * context.helpers.ts
 * Context extraction from history, artifacts, and profiles
 */

/**
 * Pick recent user signals (last 4 messages)
 */
export function pickRecentUserSignals(
  history?: Array<{ role: string; content: string }>
): string[] {
  return (
    history
      ?.filter((h) => h.role === 'user')
      .slice(-4)
      .map((h) => h.content) ?? []
  );
}

/**
 * Pick recent artifacts from context
 */
export function pickContextArtifacts(artifacts?: any[]): any[] {
  return artifacts?.slice(-4) ?? [];
}

/**
 * Pick recent charts from context
 */
export function pickContextCharts(agentBlocks?: any[]): any[] {
  return (
    agentBlocks
      ?.filter((b) => b.kind === 'chart' || (b as any).type === 'chart')
      .slice(-4) ?? []
  );
}

/**
 * Infer parameters from recent artifacts (PDF metadata)
 */
export function inferFromRecentArtifacts(artifacts?: any[]): {
  inferred_horizon_months?: number;
  inferred_monthly_contribution?: number;
} {
  const recent = pickContextArtifacts(artifacts);
  const result: any = {};

  for (const artifact of recent) {
    if (artifact.meta?.months) {
      result.inferred_horizon_months = artifact.meta.months;
    }
    if (artifact.meta?.monthly_amount) {
      result.inferred_monthly_contribution = artifact.meta.monthly_amount;
    }
  }

  return result;
}

/**
 * Infer parameters from user profile
 */
export function inferFromProfileContext(intake?: any): {
  inferred_principal?: number;
  inferred_monthly_contribution?: number;
} {
  const result: any = {};

  if (intake?.savings_current) {
    result.inferred_principal = intake.savings_current;
  }
  if (intake?.exactMonthlyIncome) {
    // Usually 10-20% of income
    const rate = 0.15;
    result.inferred_monthly_contribution = intake.exactMonthlyIncome * rate;
  }

  return result;
}

/**
 * Pick uploaded evidence (files) from context
 */
export function pickUploadedEvidence(
  context?: any
): Array<{ name: string; size?: number }> {
  return (
    context?.uploaded_documents?.map((doc: any) => ({
      name: doc.name || doc.filename || 'documento',
      size: doc.size,
    })) ?? []
  );
}

/**
 * Determine if CMF/regulatory support should be included
 */
export function shouldIncludeCMFRegulatorySupport(
  userMessage: string,
  mode?: string
): boolean {
  const lower = userMessage.toLowerCase();
  const cmfKeywords = /\b(cmf|ley fintec|regulación|norma|cumpl|legal|compliance)\b/i;
  return cmfKeywords.test(lower) || mode === 'regulation';
}
