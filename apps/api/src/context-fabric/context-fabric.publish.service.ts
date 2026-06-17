import type { ContextConflict, ContextSourceKind } from '@financial-agent/shared';
import { getContextFabricFlags, isContextPublishEnabled } from './context-fabric.policy';
import { invalidateContextPackCache } from './context-pack.service';
import { loadUserById } from '../services/user.service';
import { loadContextSourceBundle } from './context-source.loader';
import { buildFactsFromBundle, buildManifestFromBundle } from './context-provenance.service';
import { detectContextConflicts } from './context-consistency.service';
import { hashContent } from './context-version.service';
import { getLogger } from '../logger';

export type PublishContextSourceInput = {
  userId: string;
  sourceKind: ContextSourceKind;
  sourceId: string;
  contentHash: string;
  correlationId?: string;
  metadata?: Record<string, unknown>;
};

export type PublishContextSourceResult = {
  contextVersion: string;
  conflictCount: number;
  conflicts: ContextConflict[];
  publishedAt: string;
};

function isPublishEnabled(sourceKind: ContextSourceKind): boolean {
  const normalized =
    sourceKind === 'intake'
      ? 'intake'
      : sourceKind === 'document'
        ? 'document'
        : sourceKind === 'transaction'
          ? 'transaction'
          : 'other';
  return isContextPublishEnabled(normalized, getContextFabricFlags());
}

export async function publishContextSourceVersion(
  input: PublishContextSourceInput,
): Promise<PublishContextSourceResult | null> {
  if (!isPublishEnabled(input.sourceKind)) return null;

  invalidateContextPackCache(input.userId);

  const user = await loadUserById(input.userId);
  if (!user) return null;

  const bundle = await loadContextSourceBundle(user);
  const { facts } = buildFactsFromBundle(bundle);
  const manifest = buildManifestFromBundle(bundle, 0);
  const conflicts = detectContextConflicts({
    facts,
    contextVersion: manifest.contextVersion,
  });
  const manifestWithConflicts = buildManifestFromBundle(bundle, conflicts.length);
  const publishedAt = new Date().toISOString();

  getLogger().info({
    msg: 'context_fabric.source_published',
    user_id: input.userId,
    source_kind: input.sourceKind,
    source_id: input.sourceId,
    content_hash: input.contentHash,
    context_version: manifestWithConflicts.contextVersion,
    conflict_count: conflicts.length,
    correlation_id: input.correlationId,
    metadata_keys: input.metadata ? Object.keys(input.metadata) : [],
  });

  return {
    contextVersion: manifestWithConflicts.contextVersion,
    conflictCount: conflicts.length,
    conflicts,
    publishedAt,
  };
}

export async function publishDocumentParseObservation(params: {
  userId: string;
  documentIds: string[];
  movementCount?: number;
  evidenceFidelity?: string;
  correlationId?: string;
}): Promise<PublishContextSourceResult | null> {
  const contentHash = hashContent({
    documentIds: params.documentIds,
    movementCount: params.movementCount ?? 0,
    evidenceFidelity: params.evidenceFidelity ?? null,
  });
  return publishContextSourceVersion({
    userId: params.userId,
    sourceKind: 'document',
    sourceId: `parse:${params.documentIds.slice(0, 5).join(',')}`,
    contentHash,
    correlationId: params.correlationId,
    metadata: {
      documentIds: params.documentIds,
      movementCount: params.movementCount ?? 0,
      evidenceFidelity: params.evidenceFidelity,
    },
  });
}

export async function publishFinancialContextMergeObservation(params: {
  userId: string;
  reason: 'panel_merge' | 'products_sync';
  productsCount?: number;
  budgetRowsCount?: number;
}): Promise<PublishContextSourceResult | null> {
  const contentHash = hashContent({
    reason: params.reason,
    productsCount: params.productsCount ?? 0,
    budgetRowsCount: params.budgetRowsCount ?? 0,
    ts: Date.now(),
  });
  return publishContextSourceVersion({
    userId: params.userId,
    sourceKind: 'transaction',
    sourceId: `merge:${params.reason}`,
    contentHash,
    metadata: {
      reason: params.reason,
      productsCount: params.productsCount,
      budgetRowsCount: params.budgetRowsCount,
    },
  });
}

export async function publishIntakeUpdateObservation(params: {
  userId: string;
  correlationId?: string;
}): Promise<PublishContextSourceResult | null> {
  const contentHash = hashContent({
    source: 'intake_update',
    userId: params.userId,
    ts: Date.now(),
  });
  return publishContextSourceVersion({
    userId: params.userId,
    sourceKind: 'intake',
    sourceId: 'questionnaire:update',
    contentHash,
    correlationId: params.correlationId,
    metadata: { reason: 'user_correction' },
  });
}
