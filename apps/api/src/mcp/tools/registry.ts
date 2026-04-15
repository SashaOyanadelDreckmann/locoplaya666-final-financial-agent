import type { MCPTool } from './types';

const TOOLS: Record<string, MCPTool> = {};
let bootstrapped = false;

export function registerTool(tool: MCPTool) {
  TOOLS[tool.name] = tool;
}

export function getTool(name: string): MCPTool | null {
  return TOOLS[name] ?? null;
}

export function listTools(): MCPTool[] {
  return Object.values(TOOLS);
}

export function isBootstrapped() {
  return bootstrapped;
}

export function markBootstrapped() {
  bootstrapped = true;
}
