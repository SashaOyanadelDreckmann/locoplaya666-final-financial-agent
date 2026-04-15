/**
 * openai-bridge.ts
 *
 * Convierte el registro MCPTools al formato de function tools de OpenAI.
 */

import { z } from 'zod';
import { listTools } from './tools/registry';
import { bootstrapMCP } from './bootstrap';
import type { MCPTool } from './tools/types';

/** "math.calc" → "math__calc" */
export function sanitizeToolName(name: string): string {
  return name.replace(/\./g, '__').replace(/[^a-zA-Z0-9_-]/g, '_');
}

/** "math__calc" → "math.calc" */
export function getOriginalToolName(sanitized: string): string {
  return sanitized.replace(/__/g, '.');
}

function zodToJsonSchema(argsSchema: z.ZodTypeAny): Record<string, any> {
  try {
    const js = (argsSchema as any).toJSONSchema?.() ?? z.toJSONSchema(argsSchema);
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

export function buildOpenAITools() {
  bootstrapMCP();
  return listTools().map((tool) => ({
    type: 'function' as const,
    function: {
      name: sanitizeToolName(tool.name),
      description: tool.description,
      parameters: buildParameters(tool),
    },
  }));
}
