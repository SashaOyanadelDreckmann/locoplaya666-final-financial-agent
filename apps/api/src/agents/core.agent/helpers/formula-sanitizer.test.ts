import { describe, it, expect } from 'vitest';
import { sanitizeFormulaContent, containsMalformedFormula } from './formula-sanitizer';

describe('formula-sanitizer', () => {
  describe('sanitizeFormulaContent', () => {
    it('fixes completely mangled formulas like [sini(Balance) = 1 - [Gasto(...)]]', () => {
      const corrupted = '[sini(Balance) = 1 - [Gasto(Bruto de Ahorro × 1 ÷ (1-0.033))]]';
      const result = sanitizeFormulaContent(corrupted);
      // Should convert function-like patterns to LaTeX variables or remove them
      expect(result).toContain('$sini$');
      expect(result).toContain('$Gasto$');
      // Should not have the original broken syntax
      expect(result.includes('[sini(Balance) = 1 - [Gasto(')).toBe(false);
    });

    it('fixes percentage format corruption like %_[Categoría(segregación])]', () => {
      const corrupted = '%_[Categoría(segregación)]';
      const result = sanitizeFormulaContent(corrupted);
      // Should remove %_ corruption
      expect(result).not.toContain('%_');
      // Should either extract or format the category reference
      expect(result).toBeTruthy();
    });

    it('fixes double bracket patterns [[...]]', () => {
      const text = '[[variable]]';
      const result = sanitizeFormulaContent(text);
      expect(result).toContain('$variable$');
      expect(result).not.toContain('[[');
    });

    it('preserves valid LaTeX formulas with $$...$$', () => {
      const valid = '$$VF = VP \\times (1 + r)^n$$';
      const result = sanitizeFormulaContent(valid);
      // Should preserve the formula since it's well-formed
      expect(result).toContain('VF');
    });

    it('fixes malformed variable references in brackets [VAR = expr]', () => {
      const text = '[BALANCE = Ingreso - Gasto]';
      const result = sanitizeFormulaContent(text);
      // Should convert to proper LaTeX: $BALANCE$ = Ingreso - Gasto
      expect(result).toContain('$BALANCE$');
    });

    it('handles normal text without formulas', () => {
      const text = 'El resultado es muy importante para tu presupuesto.';
      const result = sanitizeFormulaContent(text);
      // Should not break normal text
      expect(result).toBe(text);
    });

    it('fixes corrupted function calls like _fin(...)', () => {
      const text = 'valor = 100_fin(.classification)]]';
      const result = sanitizeFormulaContent(text);
      // Should remove _fin(...) pattern
      expect(result).not.toContain('_fin');
    });

    it('fixes excessive closing brackets ])]', () => {
      const text = 'formula = [result])]';
      const result = sanitizeFormulaContent(text);
      // Should normalize bracket patterns
      expect(result).not.toContain('])]');
    });
  });

  describe('containsMalformedFormula', () => {
    it('detects [func(...)] pattern', () => {
      expect(containsMalformedFormula('[sini(Balance)]')).toBe(true);
      expect(containsMalformedFormula('[Gasto(valor)]')).toBe(true);
    });

    it('detects %_[ pattern', () => {
      expect(containsMalformedFormula('%_[text]')).toBe(true);
    });

    it('detects _fin( pattern', () => {
      expect(containsMalformedFormula('value _fin(x)')).toBe(true);
    });

    it('does not flag valid LaTeX', () => {
      expect(containsMalformedFormula('$$VF = VP$$')).toBe(false);
      expect(containsMalformedFormula('$variable$')).toBe(false);
    });

    it('does not flag normal text', () => {
      expect(containsMalformedFormula('Este es un texto normal')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('handles empty strings', () => {
      const result = sanitizeFormulaContent('');
      expect(result).toBe('');
    });

    it('handles formulas with multiple issues', () => {
      const corrupted = '[sini(Balance) = 1 - [Gasto(...)]]_fin(.x)';
      const result = sanitizeFormulaContent(corrupted);
      // Should remove _fin corruption
      expect(result).not.toContain('_fin');
      // Should convert function references to LaTeX format
      expect(result).toContain('$sini$');
      expect(result).toContain('$Gasto$');
    });

    it('preserves legitimate markdown links', () => {
      const text = '[Ver más](https://example.com) en nuestro sitio';
      const result = sanitizeFormulaContent(text);
      // Should preserve links
      expect(result).toContain('[Ver más]');
    });
  });
});
