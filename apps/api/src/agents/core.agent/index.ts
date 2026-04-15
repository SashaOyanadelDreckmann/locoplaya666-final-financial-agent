/**
 * index.ts
 *
 * Core Agent public interface
 * Re-exports main orchestrator function and types
 */

export { runCoreAgent } from './core-agent-orchestrator';

export type { ChatAgentInput, ChatAgentResponse } from './chat.types';
export type {
  Classification,
  ExecutionResult,
  FormattedResponse,
  CoherenceCheckResult,
  InferredUserModel,
  CoreAgentContext,
} from './agent-types';
