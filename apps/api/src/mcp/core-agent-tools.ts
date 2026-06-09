import type { MCPTool } from './tools/types';

/**
 * Tools that must never be exposed to CoreAgent ReAct.
 * PDF export is handled by the UI bubble action + /api/pdfs worker, not MCP.
 */
export const CORE_AGENT_EXCLUDED_TOOL_PREFIXES = ['pdf.'] as const;

export function isCoreAgentExcludedTool(toolName: string): boolean {
  const normalized = String(toolName ?? '').trim().toLowerCase();
  return CORE_AGENT_EXCLUDED_TOOL_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export function filterCoreAgentTools(tools: MCPTool[]): MCPTool[] {
  return tools.filter((tool) => !isCoreAgentExcludedTool(tool.name));
}

export const CORE_AGENT_PDF_HANDOFF_MESSAGE =
  'La exportación a PDF no se ejecuta en el agente. Entrega el contenido estructurado en la respuesta; el usuario puede exportarlo desde el botón Guardar PDF de la burbuja.';
