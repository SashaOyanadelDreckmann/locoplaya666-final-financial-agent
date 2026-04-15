/**
 * input-sanitizer.ts
 *
 * Canonical input sanitization wrappers for MCP tools.
 * Delegates to the shared security sanitizer to avoid divergent behavior.
 */

import {
  detectReDoSPattern as baseDetectReDoSPattern,
  sanitizeRegexPattern as baseSanitizeRegexPattern,
  sanitizeUrl as baseSanitizeUrl,
  sanitizeLargeText as baseSanitizeLargeText,
  validateNumericRange as baseValidateNumericRange,
  sanitizeString as baseSanitizeString,
  sanitizeSearchQuery as baseSanitizeSearchQuery,
  validateArrayLength as baseValidateArrayLength,
  validateMonteCarloConfig,
  containsFinancialPII,
} from '../security/input-sanitizer';
import { securityError, validationError } from './error';

export { validateMonteCarloConfig, containsFinancialPII };

export function detectReDoSPattern(pattern: string): boolean {
  return baseDetectReDoSPattern(pattern);
}

export function sanitizeRegexPattern(pattern: string, toolName: string): string {
  try {
    return baseSanitizeRegexPattern(pattern);
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes('dangerous')) {
      throw securityError(toolName, error.message);
    }
    throw validationError(toolName, 'pattern', error instanceof Error ? error.message : 'Invalid regex');
  }
}

export function sanitizeUrl(url: string, toolName: string): string {
  try {
    return baseSanitizeUrl(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid URL format';
    if (message.toLowerCase().includes('blocked') || message.toLowerCase().includes('allowed')) {
      throw securityError(toolName, message);
    }
    throw validationError(toolName, 'url', message);
  }
}

export function sanitizeLargeText(text: string, maxLength: number, _toolName: string): string {
  return baseSanitizeLargeText(text, maxLength);
}

export function validateNumericRange(
  value: number,
  min: number,
  max: number,
  fieldName: string,
  toolName: string,
): number {
  try {
    return baseValidateNumericRange(value, min, max, fieldName);
  } catch (error) {
    throw validationError(toolName, fieldName, error instanceof Error ? error.message : 'Invalid number');
  }
}

export function sanitizeString(
  input: string,
  minLength: number,
  maxLength: number,
  fieldName: string,
  toolName: string,
): string {
  try {
    return baseSanitizeString(input, { min: minLength, max: maxLength });
  } catch (error) {
    throw validationError(toolName, fieldName, error instanceof Error ? error.message : 'Invalid text');
  }
}

export function sanitizeSearchQuery(query: string, toolName: string): string {
  try {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      throw new Error('Query must be at least 2 characters');
    }
    return baseSanitizeSearchQuery(trimmed);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid query';
    if (message.toLowerCase().includes('suspicious')) {
      throw securityError(toolName, message);
    }
    throw validationError(toolName, 'query', message);
  }
}

export function validateArrayLength(
  array: unknown[],
  minLength: number,
  maxLength: number,
  fieldName: string,
  toolName: string,
): unknown[] {
  if (array.length < minLength) {
    throw validationError(toolName, fieldName, `Array must have at least ${minLength} items`);
  }

  try {
    return baseValidateArrayLength(array, maxLength, fieldName);
  } catch (error) {
    throw validationError(toolName, fieldName, error instanceof Error ? error.message : 'Invalid array');
  }
}
