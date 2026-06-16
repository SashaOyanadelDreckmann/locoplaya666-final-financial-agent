import { describe, expect, it } from 'vitest';

import { filterCoreAgentTools, isCoreAgentExcludedTool } from './core-agent-tools';
import type { MCPTool } from './tools/types';

function mockTool(name: string): MCPTool {
  return {
    name,
    description: name,
    run: async () => ({ tool_call: { id: '1', tool: name, args: {}, status: 'success' }, data: {} }),
  };
}

describe('core-agent-tools', () => {
  it('excludes pdf namespace tools from core agent exposure', () => {
    expect(isCoreAgentExcludedTool('pdf.generate_report')).toBe(true);
    expect(isCoreAgentExcludedTool('finance.simulate')).toBe(false);
    expect(isCoreAgentExcludedTool('context.get_pack')).toBe(true);
  });

  it('filters pdf and context tools out of the OpenAI tool list', () => {
    const filtered = filterCoreAgentTools([
      mockTool('finance.simulate'),
      mockTool('pdf.generate_report'),
      mockTool('context.get_manifest'),
      mockTool('rag.lookup'),
    ]);
    expect(filtered.map((tool) => tool.name)).toEqual(['finance.simulate', 'rag.lookup']);
  });
});
