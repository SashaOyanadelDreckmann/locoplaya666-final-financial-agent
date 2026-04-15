/**
 * anthropic-bridge.ts
 *
 * Convierte el registro de MCPTools al formato nativo de herramientas de
 * la API de Anthropic (`Anthropic.Tool[]`).
 *
 * Reglas de mapeo de nombres:
 *   "math.calc"        → "math__calc"
 *   "market.uf_cl"     → "market__uf_cl"
 *   "rag.lookup"       → "rag__lookup"
 *
 * Los nombres de herramientas en Anthropic solo admiten [a-zA-Z0-9_-].
 * Usamos doble guión bajo (__) para representar el punto (.) de forma
 * biunívoca y reversible.
 */

import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { listTools } from './tools/registry';
import { bootstrapMCP } from './bootstrap';
import type { MCPTool } from './tools/types';

// ─────────────────────────────────────────────────────────────────────────────
// Conversión de nombres
// ─────────────────────────────────────────────────────────────────────────────

/** "math.calc" → "math__calc" */
export function sanitizeToolName(name: string): string {
  return name.replace(/\./g, '__').replace(/[^a-zA-Z0-9_-]/g, '_');
}

/** "math__calc" → "math.calc" */
export function getOriginalToolName(sanitized: string): string {
  return sanitized.replace(/__/g, '.');
}

// ─────────────────────────────────────────────────────────────────────────────
// Conversión de esquemas Zod → JSON Schema
// ─────────────────────────────────────────────────────────────────────────────

function zodToInputSchema(
  argsSchema: z.ZodTypeAny,
): Anthropic.Tool['input_schema'] {
  try {
    // Zod v4 expone toJSONSchema() en cada instancia
    const js = (argsSchema as any).toJSONSchema?.() ?? z.toJSONSchema(argsSchema);
    return {
      type: 'object',
      properties: (js as any).properties ?? {},
      required: (js as any).required ?? [],
    };
  } catch {
    return { type: 'object', properties: {} };
  }
}

function buildInputSchema(tool: MCPTool): Anthropic.Tool['input_schema'] {
  if (tool.argsSchema) {
    return zodToInputSchema(tool.argsSchema);
  }
  if (tool.schema) {
    return {
      type: 'object',
      properties: (tool.schema as any).properties ?? {},
      required: (tool.schema as any).required ?? [],
    };
  }
  return { type: 'object', properties: {} };
}

// ─────────────────────────────────────────────────────────────────────────────
// API pública
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retorna todas las herramientas registradas en el MCP registry convertidas
 * al formato `Anthropic.Tool[]` listo para pasarle a `messages.create()`.
 */
export function buildAnthropicTools(): Anthropic.Tool[] {
  bootstrapMCP();
  return listTools().map((tool): Anthropic.Tool => ({
    name: sanitizeToolName(tool.name),
    description: tool.description,
    input_schema: buildInputSchema(tool),
  }));
}
