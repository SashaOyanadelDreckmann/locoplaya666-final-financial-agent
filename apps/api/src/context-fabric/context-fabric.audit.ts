import { getLogger } from '../logger';
import type { ContextFabricFlags } from './context-fabric.policy';

export type ContextFabricAuditEvent = {
  correlationId?: string;
  pipeline?: string;
  contextVersion: string;
  packVersion: string;
  includedSections: string[];
  omittedSections: string[];
  tokenEstimate: number;
  cacheStatus: string;
  conflictCount: number;
  factCount: number;
  latencyMs: number;
  flags: ContextFabricFlags;
};

export function logContextFabricAudit(event: ContextFabricAuditEvent): void {
  const logger = getLogger();
  logger.info({
    msg: 'context_fabric.audit',
    correlation_id: event.correlationId,
    pipeline: event.pipeline,
    context_version: event.contextVersion,
    pack_version: event.packVersion,
    included_sections: event.includedSections,
    omitted_sections: event.omittedSections,
    token_estimate: event.tokenEstimate,
    cache_status: event.cacheStatus,
    conflict_count: event.conflictCount,
    fact_count: event.factCount,
    latency_ms: event.latencyMs,
    shadow_mode: event.flags.shadowMode,
    fabric_enabled: event.flags.enabled,
  });
}
