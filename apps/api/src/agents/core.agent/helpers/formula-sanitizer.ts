/**
 * formula-sanitizer.ts
 * Validates and corrects malformed financial formulas before they reach users
 */

/**
 * Detects malformed formula patterns and fixes them
 * Patterns fixed:
 * - Unmatched brackets: [text] → text or ${text}$
 * - Double bracket patterns: [[...]] → $...$
 * - Invalid function syntax: [func(...]  → func(...)
 * - Malformed variable references: [Var(...)] → $Var$ or fix the expression
 */
export function sanitizeFormulaContent(message: string): string {
  if (!message || message.length === 0) return message;

  let result = message;

  // Pattern 0: First remove/fix the absolute worst corruption patterns
  result = removeCorruptionMarkers(result);

  // Pattern 1: Fix patterns like [identifier(...)] regardless of what comes after
  result = fixBracketedFunctionPatterns(result);

  // Pattern 2: Fix double-bracket patterns [[...]] → $...$
  result = fixDoubleBrackets(result);

  // Pattern 3: Fix single malformed bracket patterns [VAR = expr] → $VAR$ = expr
  result = fixMalformedBrackets(result);

  // Pattern 4: Ensure proper LaTeX formatting for mathematical expressions
  result = ensureProperLatexFormatting(result);

  // Pattern 5: Fix escaped LaTeX that got corrupted (e.g., \\ becoming \\\\)
  result = fixEscapedLatex(result);

  return result;
}

/**
 * Remove corruption markers like %_, _fin(...), etc.
 */
function removeCorruptionMarkers(text: string): string {
  // Remove %_[ and ]%_ patterns
  text = text.replace(/%_\[/g, '[');
  text = text.replace(/\]%_/g, ']');
  text = text.replace(/%_/g, '');

  // Remove _fin(...) patterns (corrupted function markers)
  text = text.replace(/_fin\s*\([^)]*\)\]?/g, '');
  text = text.replace(/_fin\s*\([^)]*\)/g, '');

  return text;
}

/**
 * Fix patterns like [identifier(...)] or [identifier(...) = expr]
 */
function fixBracketedFunctionPatterns(text: string): string {
  // Pattern: [identifier(...) = something] or [identifier(...)...]
  // Match [word( and replace the bracket with LaTeX format
  text = text.replace(/\[\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g, (match, varName) => {
    // Convert [identifier( to $identifier$ (
    return `\$${varName}\$ (`;
  });

  return text;
}


/**
 * Fix double-bracket patterns [[...]] → $...$
 */
function fixDoubleBrackets(text: string): string {
  // [[variable]] → $variable$
  // Use a replacement function to avoid confusion with $ in the replacement
  text = text.replace(/\[\[\s*([^[\]]+)\s*\]\]/g, (match, content) => {
    return `$${content}$`;
  });

  // [[$expr$]] → $$expr$$
  text = text.replace(/\[\[\s*\$([^\$]+)\$\s*\]\]/g, (match, expr) => {
    return `$$${expr}$$`;
  });

  return text;
}

/**
 * Fix single malformed bracket patterns
 * [VAR = expr] → $VAR$ = expr (for variable definitions)
 * [expr] inside text → expr (remove unnecessary brackets)
 */
function fixMalformedBrackets(text: string): string {
  // Preserve if it's clearly a code block marker or list
  const lines = text.split('\n');
  const fixed = lines.map((line) => {
    // Skip lines that are markdown lists, code blocks, or other special patterns
    if (line.trim().startsWith('[') && !line.includes('=')) {
      // Could be a link or list, preserve it
      return line;
    }

    // [VAR = ...] pattern at line level
    if (/^\s*\[\s*[A-Z_][A-Z0-9_]*\s*=/.test(line)) {
      return line.replace(/\[\s*([A-Z_][A-Z0-9_]*)\s*=/g, '$$$1$ =');
    }

    // [text with no = sign] in middle of line (likely corruption)
    // But be careful not to break actual brackets
    return line.replace(/\s\[([a-zA-Z_][a-zA-Z0-9_]*[a-zA-Z0-9])\](?!\()/g, ' $$$1$');
  });

  return fixed.join('\n');
}

/**
 * Ensure proper LaTeX formatting for mathematical expressions
 * - Make sure $...$ patterns are properly closed
 * - Ensure $$ patterns for display math are on separate lines
 */
function ensureProperLatexFormatting(text: string): string {
  // Fix unclosed $ patterns (single occurrence without closing $)
  const lines = text.split('\n');

  const fixed = lines.map((line) => {
    // Count $ signs to detect unclosed patterns
    const dollarCount = (line.match(/\$/g) || []).length;

    // If odd number of $, we might have a problem
    if (dollarCount % 2 !== 0) {
      // Try to find and close the pattern
      // If line contains math-like content, wrap it
      if (/\d+|[×÷+\-]|[a-zA-Z]{2,}/.test(line.replace(/\$/g, ''))) {
        // This might be a formula, ensure it's properly closed
        return line.replace(/\$([^$]*?)$/g, '$$$$1$');
      }
    }

    return line;
  });

  let result = fixed.join('\n');

  // Ensure display math ($$...$$ ) has proper spacing
  result = result.replace(/([^\n])\$\$/g, '$1\n$$');
  result = result.replace(/\$\$([^\n])/g, '$$\n$1');

  return result;
}

/**
 * Fix escaped LaTeX sequences that got corrupted
 */
function fixEscapedLatex(text: string): string {
  // Fix double-escaped sequences like \\\\ → \\
  text = text.replace(/\\\\\\\\/g, '\\\\');

  // Fix \( → $ and \) → $ (some systems convert LaTeX delimiters)
  // Only if not already in proper $...$ format
  text = text.replace(/\\\(/g, '$');
  text = text.replace(/\\\)/g, '$');

  return text;
}

/**
 * Validate if a string contains a malformed formula
 * Returns true if the text has corruption indicators
 */
export function containsMalformedFormula(text: string): boolean {
  if (!text) return false;

  // Indicators of malformed formulas:
  const malformedPatterns = [
    /\[\s*[a-zA-Z_][a-zA-Z0-9_]*\s*\([^)]*\)\s*\]/,  // [func(...)]
    /\]\s*\]\s*[^=]/,                                   // ]] followed by non-equals
    /\]\s*\([^)]*\)/,                                   // ](...)
    /%_\[/,                                             // %_[
    /\[\s*%_/,                                          // [%_
    /_fin\s*\(/,                                        // _fin(
    /\[\s*[a-zA-Z_]+\s*\([^)]*\)\s*\]/,                // [identifier(...)]
  ];

  return malformedPatterns.some((pattern) => pattern.test(text));
}

/**
 * Extract and fix formula blocks from a message
 * Processes each potential formula separately to avoid cascading fixes
 */
export function extractAndFixFormulas(text: string): string {
  // Split by $$ to identify display math blocks
  const displayMathBlocks = text.split(/(\$\$[^$]*\$\$)/);

  const fixed = displayMathBlocks.map((block) => {
    if (block.startsWith('$$') && block.endsWith('$$')) {
      // This is a display math block, validate the content
      const content = block.slice(2, -2);
      if (containsMalformedFormula(content)) {
        // Try to fix it
        const sanitized = sanitizeFormulaContent(content);
        return `$$${sanitized}$$`;
      }
      return block;
    }

    // For non-math blocks, apply general sanitization
    return sanitizeFormulaContent(block);
  });

  return fixed.join('');
}
