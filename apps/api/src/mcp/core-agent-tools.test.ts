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
  });

  it('filters pdf tools out of the OpenAI tool list', () => {
    const filtered = filterCoreAgentTools([
      mockTool('finance.simulate'),
      mockTool('pdf.generate_report'),
      mockTool('rag.lookup'),
    ]);
    expect(filtered.map((tool) => tool.name)).toEqual(['finance.simulate', 'rag.lookup']);
  });
});
