import { registerTool } from '../tools/registry';
import { getContextFabricFlags, isContextFabricMcpToolsEnabled } from '../../context-fabric/context-fabric.policy';
import { CONTEXT_FABRIC_TOOLS } from './context.tools';

let contextToolsRegistered = false;

export function bootstrapContextMCP(): void {
  if (contextToolsRegistered) return;
  const flags = getContextFabricFlags();
  if (!isContextFabricMcpToolsEnabled(flags)) return;
  for (const tool of CONTEXT_FABRIC_TOOLS) {
    registerTool(tool);
  }
  contextToolsRegistered = true;
}

export function resetContextMcpBootstrapForTests(): void {
  contextToolsRegistered = false;
}
