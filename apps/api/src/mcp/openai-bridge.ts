/**
 * openai-bridge.ts
 *
 * Convierte el registro MCPTools al formato de function tools de OpenAI.
 */

import { listTools } from './tools/registry';
import { bootstrapMCP } from './bootstrap';
import type { MCPTool } from './tools/types';
import { filterCoreAgentTools } from './core-agent-tools';

export { isCoreAgentExcludedTool, CORE_AGENT_PDF_HANDOFF_MESSAGE } from './core-agent-tools';

/** "math.calc" → "math__calc" */
export function sanitizeToolName(name: string): string {
  return name.replace(/\./g, '__').replace(/[^a-zA-Z0-9_-]/g, '_');
}

/** "math__calc" → "math.calc" */
export function getOriginalToolName(sanitized: string): string {
  return sanitized.replace(/__/g, '.');
}

function zodToJsonSchema(argsSchema: { _def?: unknown }): Record<string, any> {
  try {
    const js = (argsSchema as any).toJSONSchema?.();
    return {
      type: 'object',
      properties: (js as any).properties ?? {},
      required: (js as any).required ?? [],
      additionalProperties: false,
    };
  } catch {
    return { type: 'object', properties: {}, additionalProperties: false };
  }
}

function buildParameters(tool: MCPTool): Record<string, any> {
  if (tool.argsSchema) {
    return zodToJsonSchema(tool.argsSchema);
  }
  if (tool.schema) {
    return {
      type: 'object',
      properties: (tool.schema as any).properties ?? {},
      required: (tool.schema as any).required ?? [],
      additionalProperties: false,
    };
  }
  return { type: 'object', properties: {}, additionalProperties: false };
}

type OpenAIToolAudience = 'core' | 'all';

function mapToolsToOpenAI(tools: MCPTool[]) {
  return tools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: sanitizeToolName(tool.name),
      description: tool.description,
      parameters: buildParameters(tool),
    },
  }));
}

export function buildOpenAITools(options?: { audience?: OpenAIToolAudience }) {
  bootstrapMCP();
  const tools = listTools();
  const audience = options?.audience ?? 'all';
  const scopedTools = audience === 'core' ? filterCoreAgentTools(tools) : tools;
  return mapToolsToOpenAI(scopedTools);
}

export function buildCoreAgentOpenAITools() {
  return buildOpenAITools({ audience: 'core' });
}
