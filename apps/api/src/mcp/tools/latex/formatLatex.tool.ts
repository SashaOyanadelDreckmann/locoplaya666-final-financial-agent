import { z } from 'zod';
import type { MCPTool } from '../types';
import {
  createMetricsCollector,
  recordToolMetrics,
} from '../../security/telemetry';
import {
  validateArrayLength,
  sanitizeString,
} from '../../security/input-sanitizer';
import { wrapError } from '../../security/error';

const TOOL_NAME = 'latex.format';

/**
 * Converts plain text with mathematical notation into professional LaTeX format.
 * Handles:
 * - Converting formulas to display ($$...$$) and inline ($...$) modes
 * - Standardizing mathematical notation (x → \times, / → \frac, etc)
 * - Extracting and formatting variable definitions
 * - Validating LaTeX syntax
 */
export const formatLatexTool: MCPTool = {
  name: TOOL_NAME,
  description:
    'Converts financial formulas and equations to professional LaTeX format compatible with KaTeX. Handles display and inline math, variable definitions, and mathematical notation standardization.',
  argsSchema: z.object({
    content: z.string().min(10).max(5000),
    mode: z.enum(['auto', 'educational', 'technical']).optional().default('auto'),
    includeVariables: z.boolean().optional().default(true),
  }),
  schema: {
    type: 'object',
    properties: {
      content: { type: 'string' },
      mode: { type: 'string', enum: ['auto', 'educational', 'technical'] },
      includeVariables: { type: 'boolean' },
    },
    required: ['content'],
  },
  run: async (args) => {
    const metrics = createMetricsCollector(TOOL_NAME);

    try {
      // 1. Validate inputs
      const content = sanitizeString(args.content, { min: 10, max: 5000 });
      const mode = args.mode || 'auto';
      const includeVariables = args.includeVariables !== false;

      // 2. Process LaTeX formatting
      const formatted = convertToLatex(content, mode);

      // 3. Extract variable definitions if requested
      const variables = includeVariables ? extractVariables(formatted) : [];

      // 4. Record metrics
      const metrics_result = metrics.recordSuccess();
      recordToolMetrics(metrics_result);

      return {
        tool_call: {
          tool: TOOL_NAME,
          args,
          status: 'success',
          result: {
            formattedContent: formatted,
            variableCount: variables.length,
          },
        },
        data: {
          formattedContent: formatted,
          variables,
          mode,
          processingStats: {
            originalLength: content.length,
            formattedLength: formatted.length,
            variablesExtracted: variables.length,
          },
        },
      };
    } catch (error) {
      const toolError = wrapError(error, TOOL_NAME);
      const metrics_error = metrics.recordError(toolError.code);
      recordToolMetrics(metrics_error);
      throw toolError;
    }
  },
};

/**
 * Converts plain text formulas to LaTeX format
 */
function convertToLatex(content: string, mode: string): string {
  let result = content;

  // Pattern 1: Convert "VF = VP x (1 + r)^n" to LaTeX display
  result = result.replace(
    /([A-Z]{2,})\s*=\s*([^.!?\n]+?(?:=|$|[.!?]))/g,
    (match, variable, expression) => {
      if (isFormulaExpression(expression)) {
        const latexExpr = expressionToLatex(expression.trim());
        return `$$${variable} = ${latexExpr}$$`;
      }
      return match;
    }
  );

  // Pattern 2: Convert common mathematical notations
  result = standardizeMathNotation(result);

  // Pattern 3: Format variable definitions
  result = formatVariableDefinitions(result);

  // Pattern 4: Ensure proper spacing around formulas
  result = cleanupFormatting(result);

  return result;
}

/**
 * Check if a string looks like a formula
 */
function isFormulaExpression(expr: string): boolean {
  const formulaPatterns = [
    /[\+\-\*\/\^]/,           // Has operators
    /\(\d+\)/,                // Has parenthetical numbers
    /\b[a-zA-Z]+\^[0-9n]/,    // Has exponentials
    /tasa|rate|r\b|interés/i, // Financial keywords
  ];
  return formulaPatterns.some(p => p.test(expr));
}

/**
 * Convert mathematical expression to LaTeX
 */
function expressionToLatex(expr: string): string {
  let result = expr;

  // Multiplication: x → \times
  result = result.replace(/\s+x\s+/g, ' \\times ');

  // Fractions: a/b → \frac{a}{b}
  result = result.replace(/(\w+)\/(\w+)/g, '\\frac{$1}{$2}');

  // Exponentials: a^n → a^{n}
  result = result.replace(/(\w+)\^(\w+)/g, '$1^{$2}');
  result = result.replace(/(\))\^(\w+)/g, '$1^{$2}');

  // Operators spacing
  result = result.replace(/\s*\+\s*/g, ' + ');
  result = result.replace(/\s*-\s*/g, ' - ');

  // Replace variable markers with LaTeX inline
  result = result.replace(/\b([A-Z]{2})\b/g, '$$$1$');

  return result.trim();
}

/**
 * Standardize mathematical notation
 */
function standardizeMathNotation(content: string): string {
  let result = content;

  // Convert "donde:" to "Donde:"
  result = result.replace(/donde\s*:/gi, 'Donde:');

  // Convert variable lists
  result = result.replace(/([A-Z]{2})\s*=/g, '- $$1$ =');

  // Standardize percentage notation
  result = result.replace(/(\d+)%/g, '$1\\%');

  // Financial abbreviations
  result = result.replace(/\bVF\b/g, '$VF$');
  result = result.replace(/\bVP\b/g, '$VP$');
  result = result.replace(/\bCAPI?TAL\b/i, '$CAPITAL$');
  result = result.replace(/\bTASA\b/i, '$tasa$');
  result = result.replace(/\bPLAZO\b/i, '$plazo$');

  return result;
}

/**
 * Format variable definition sections
 */
function formatVariableDefinitions(content: string): string {
  const lines = content.split('\n');
  let inVariableSection = false;
  let result: string[] = [];

  for (const line of lines) {
    if (/^Donde:|^Variables:|^Where:/i.test(line)) {
      inVariableSection = true;
      result.push(line);
      continue;
    }

    if (inVariableSection && line.trim().length === 0) {
      inVariableSection = false;
      result.push(line);
      continue;
    }

    if (inVariableSection && /^\s*-\s*\$\$/.test(line)) {
      // Already formatted
      result.push(line);
    } else if (inVariableSection && /^\s*-/.test(line)) {
      // Format bullet with variable
      const match = line.match(/^\s*-\s*([A-Z]{2,})\s*=\s*(.+)$/);
      if (match) {
        result.push(`  - $${match[1]}$ = ${match[2]}`);
      } else {
        result.push(line);
      }
    } else {
      result.push(line);
    }
  }

  return result.join('\n');
}

/**
 * Clean up formatting (spacing, line breaks)
 */
function cleanupFormatting(content: string): string {
  let result = content;

  // Ensure blank line before formulas
  result = result.replace(/([^\n])\n(\$\$)/g, '$1\n\n$$');

  // Ensure blank line after formulas
  result = result.replace(/(\$\$)\n([^\n])/g, '$$\n\n$2');

  // Remove excessive blank lines
  result = result.replace(/\n\n\n+/g, '\n\n');

  // Clean up spacing around operators
  result = result.replace(/\s+(\+|-|\*|\/|\^)\s+/g, ' $1 ');

  return result.trim();
}

/**
 * Extract variable definitions from formatted content
 */
function extractVariables(content: string): Array<{ name: string; definition: string }> {
  const variables: Array<{ name: string; definition: string }> = [];

  // Pattern: $VAR$ = definition
  const pattern = /\$([A-Z]{2,})\$\s*=\s*([^$\n]+)/g;
  let match;

  while ((match = pattern.exec(content)) !== null) {
    variables.push({
      name: match[1],
      definition: match[2].trim(),
    });
  }

  return variables;
}
