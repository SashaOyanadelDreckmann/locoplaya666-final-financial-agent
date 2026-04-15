/**
 * Input sanitization for MCP tools
 * Prevents: ReDoS attacks, SSRF, injection, resource exhaustion
 */

import { validationError, securityError } from './error';

/**
 * Detect and prevent ReDoS (Regular Expression Denial of Service) patterns
 * Identifies dangerous regex patterns before they're compiled
 */
export function detectReDoSPattern(pattern: string): boolean {
  // Nested quantifiers: (a+)+, (a|a)*
  if (/(.*\+\)|\*\)|\?\)|\{\d+,?\}){2,}/.test(pattern)) {
    return true;
  }

  // Alternation with overlap: (a|a), (a|ab)
  if (/\([^)]*\|[^)]*\)/.test(pattern)) {
    const parts = pattern.match(/\(([^)]*)\)/g);
    if (parts) {
      for (const part of parts) {
        const alts = part
          .slice(1, -1)
          .split('|')
          .map((s) => s.trim());
        for (let i = 0; i < alts.length; i++) {
          for (let j = i + 1; j < alts.length; j++) {
            if (alts[i].startsWith(alts[j]) || alts[j].startsWith(alts[i])) {
              return true;
            }
          }
        }
      }
    }
  }

  return false;
}

/**
 * Sanitize and validate regex patterns before use
 * Prevents ReDoS, enforces length limits, validates compilation
 */
export function sanitizeRegexPattern(pattern: string): string {
  // Enforce max pattern length
  if (pattern.length > 200) {
    throw validationError('Regex pattern exceeds 200 characters');
  }

  // Detect ReDoS patterns
  if (detectReDoSPattern(pattern)) {
    throw securityError('Regex pattern contains dangerous constructs');
  }

  // Test if pattern compiles
  try {
    new RegExp(pattern, 'g');
  } catch (err) {
    throw validationError(`Invalid regex pattern: ${String(err)}`);
  }

  return pattern;
}

/**
 * Sanitize and validate URLs
 * Prevents SSRF (Server-Side Request Forgery) attacks
 */
export function sanitizeUrl(urlString: string): string {
  // Length limit
  if (urlString.length > 2048) {
    throw validationError('URL exceeds 2048 characters');
  }

  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw validationError('Invalid URL format');
  }

  // Only allow http and https
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw securityError('Only http:// and https:// protocols allowed');
  }

  // Block localhost and private IPs (SSRF prevention)
  const hostname = url.hostname.toLowerCase();
  const blockedPatterns = [
    /^localhost$/,
    /^127\./, // 127.0.0.1
    /^10\./, // 10.0.0.0/8
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12
    /^192\.168\./, // 192.168.0.0/16
    /^169\.254\./, // 169.254.0.0/16 (link-local)
    /^::1$/, // IPv6 loopback
    /^fc00:/, // IPv6 private
    /^fe80:/, // IPv6 link-local
  ];

  for (const pattern of blockedPatterns) {
    if (pattern.test(hostname)) {
      throw securityError(`Access to ${hostname} is blocked`);
    }
  }

  return url.toString();
}

/**
 * Sanitize and validate string inputs
 * Enforces length limits, rejects malicious patterns
 */
export function sanitizeString(
  text: string,
  options?: { min?: number; max?: number }
): string {
  const min = options?.min ?? 0;
  const max = options?.max ?? 2000;

  if (text.length < min) {
    throw validationError(`Text must be at least ${min} characters`);
  }

  if (text.length > max) {
    throw validationError(`Text must not exceed ${max} characters`);
  }

  return text;
}

/**
 * Sanitize large text by truncating to max size
 * Used for response size limiting
 */
export function sanitizeLargeText(
  text: string,
  maxSizeBytes: number = 1024 * 1024 // 1MB default
): string {
  const buffer = Buffer.from(text, 'utf-8');
  if (buffer.length > maxSizeBytes) {
    return buffer.slice(0, maxSizeBytes).toString('utf-8', 0, maxSizeBytes);
  }
  return text;
}

/**
 * Validate numeric value is within acceptable range
 */
export function validateNumericRange(
  value: number,
  min: number,
  max: number,
  fieldName: string = 'value'
): number {
  if (Number.isNaN(value)) {
    throw validationError(`${fieldName} must be a valid number`);
  }

  if (value < min || value > max) {
    throw validationError(
      `${fieldName} must be between ${min} and ${max}, got ${value}`
    );
  }

  return value;
}

/**
 * Sanitize search queries
 * Prevents injection, enforces length limits
 */
export function sanitizeSearchQuery(query: string): string {
  // Basic length validation
  const sanitized = sanitizeString(query, { min: 1, max: 500 });

  // Detect obvious injection attempts
  const suspiciousPatterns = [
    /;\s*(drop|delete|insert|update|execute|script)/i,
    /<\s*script[^>]*>/i,
    /javascript:/i,
    /on\w+\s*=/i, // onload=, onclick=, etc.
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(sanitized)) {
      throw securityError('Query contains suspicious patterns');
    }
  }

  return sanitized;
}

/**
 * Validate array length for array inputs
 * Prevents resource exhaustion from huge arrays
 */
export function validateArrayLength(
  arr: unknown[],
  maxLength: number = 1000,
  fieldName: string = 'array'
): unknown[] {
  if (!Array.isArray(arr)) {
    throw validationError(`${fieldName} must be an array`);
  }

  if (arr.length > maxLength) {
    throw validationError(
      `${fieldName} exceeds maximum length of ${maxLength}`
    );
  }

  return arr;
}

/**
 * Validate Monte Carlo configuration
 * Prevents excessive computation
 */
export function validateMonteCarloConfig(config: {
  paths?: number;
  steps?: number;
}): void {
  const maxPaths = 5000;
  const maxSteps = 1000;

  if (config.paths && config.paths > maxPaths) {
    throw validationError(`Monte Carlo paths cannot exceed ${maxPaths}`);
  }

  if (config.steps && config.steps > maxSteps) {
    throw validationError(`Monte Carlo steps cannot exceed ${maxSteps}`);
  }
}

/**
 * Check for financial PII exposure
 * Detects potential card numbers, SSN, etc.
 */
export function containsFinancialPII(text: string): boolean {
  const patterns = [
    /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/, // Credit card
    /\b\d{3}-\d{2}-\d{4}\b/, // SSN format
    /routing\s*number|account\s*number/i,
    /cvv|cvc|card\s*security/i,
  ];

  for (const pattern of patterns) {
    if (pattern.test(text)) {
      return true;
    }
  }

  return false;
}
