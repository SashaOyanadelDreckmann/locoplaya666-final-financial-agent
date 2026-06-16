import type { MCPTool } from './tools/types';

/**
 * Core Agent MCP tool policy.
 * PDF export is UI-only; meta-tools (agent.*) are sandboxed computation pipelines.
 */
export const CORE_AGENT_META_TOOL_PREFIX = 'agent.' as const;
export const CORE_AGENT_EXCLUDED_TOOL_PREFIXES = ['pdf.', 'context.'] as const;

export function isCoreAgentExcludedTool(toolName: string): boolean {
  const normalized = String(toolName ?? '').trim().toLowerCase();
  return CORE_AGENT_EXCLUDED_TOOL_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export function filterCoreAgentTools(tools: MCPTool[]): MCPTool[] {
  return tools.filter((tool) => !isCoreAgentExcludedTool(tool.name));
}

export const CORE_AGENT_PDF_HANDOFF_MESSAGE =
  'La exportación a PDF no se ejecuta en el agente. Entrega el contenido estructurado en la respuesta; el usuario puede exportarlo desde el botón Guardar PDF de la burbuja.';
