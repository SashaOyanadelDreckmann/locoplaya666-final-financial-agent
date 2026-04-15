import { describe, it, expect } from 'vitest';
import { formatLatexTool } from './formatLatex.tool';

describe('formatLatex.tool - Integration Tests', () => {
  it('should be properly exported as MCPTool', () => {
    expect(formatLatexTool).toBeDefined();
    expect(formatLatexTool.name).toBe('latex.format');
    expect(formatLatexTool.description).toBeDefined();
    expect(formatLatexTool.argsSchema).toBeDefined();
    expect(formatLatexTool.run).toBeDefined();
  });

  it('should have proper schema', () => {
    expect(formatLatexTool.schema).toBeDefined();
    expect(formatLatexTool.schema?.type).toBe('object');
    expect(formatLatexTool.schema?.properties).toBeDefined();
    expect(formatLatexTool.schema?.required).toContain('content');
  });

  it('should format simple financial formula', async () => {
    const result = await formatLatexTool.run({
      content: 'VF = VP x (1 + r)^n',
      mode: 'auto',
      includeVariables: true,
    });

    expect(result.data).toBeDefined();
    expect(result.data.formattedContent).toBeDefined();
    expect(result.data.variables).toBeDefined();
    expect(result.tool_call.status).toBe('success');
  });

  it('should handle educational mode', async () => {
    const result = await formatLatexTool.run({
      content: 'Formula: x = a/b and y^2 = c',
      mode: 'educational',
      includeVariables: true,
    });

    expect(result.tool_call.status).toBe('success');
    expect(result.data.mode).toBe('educational');
  });

  it('should extract variable definitions', async () => {
    const result = await formatLatexTool.run({
      content: 'VF = VP x (1 + r)^n\nDonde:\n- VF = Valor Futuro\n- VP = Valor Presente\n- r = tasa de interés',
      mode: 'auto',
      includeVariables: true,
    });

    expect(result.data.variables).toBeDefined();
    expect(Array.isArray(result.data.variables)).toBe(true);
  });
});
