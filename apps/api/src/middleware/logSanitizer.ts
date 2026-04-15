/**
 * Log Sanitizer Middleware
 *
 * Redacts sensitive information from logs to prevent data leakage.
 * Sanitizes:
 * - API keys and tokens
 * - Authentication credentials
 * - Financial account numbers
 * - Personal information
 */

const SENSITIVE_PATTERNS = [
  { key: /authorization/i, mask: 'Bearer ***' },
  { key: /x-dev-admin-token/i, mask: '***' },
  { key: /x-csrf-token/i, mask: '***' },
  { key: /api[_-]?key/i, mask: '***' },
  { key: /session/i, mask: '***' },
  { key: /password/i, mask: '***' },
  { key: /token/i, mask: '***' },
  { key: /secret/i, mask: '***' },
  { key: /credit[_-]?card/i, mask: '****-****-****-****' },
  { key: /account[_-]?number/i, mask: '****-****-****' },
  { key: /ssn|social[_-]?security/i, mask: '***-**-****' },
  { key: /routing[_-]?number/i, mask: '**-*-*' },
  { key: /bank[_-]?account/i, mask: '****-****' },
];

export function sanitizeObject(obj: any): any {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item));
  }

  const sanitized: any = {};

  for (const [key, value] of Object.entries(obj)) {
    let sanitizedValue = value;

    // Check if key matches any sensitive pattern
    const isSensitive = SENSITIVE_PATTERNS.some((pattern) =>
      pattern.key.test(key)
    );

    if (isSensitive) {
      // Find matching pattern and apply mask
      const pattern = SENSITIVE_PATTERNS.find((p) => p.key.test(key));
      sanitizedValue = pattern?.mask || '***';
    } else if (typeof value === 'object' && value !== null) {
      sanitizedValue = sanitizeObject(value);
    }

    sanitized[key] = sanitizedValue;
  }

  return sanitized;
}

export function sanitizeString(str: string): string {
  if (!str || typeof str !== 'string') {
    return str;
  }

  let result = str;

  // Mask common API key patterns (openai-*, sk-*, etc.)
  result = result.replace(/sk-[A-Za-z0-9]{20,}/g, 'sk-***');
  result = result.replace(/pk-[A-Za-z0-9]{20,}/g, 'pk-***');
  result = result.replace(/openai-[A-Za-z0-9]{20,}/g, 'openai-***');

  // Mask JWT tokens (rough pattern)
  result = result.replace(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, 'jwt-***');

  // Mask Bearer tokens
  result = result.replace(/Bearer\s+[A-Za-z0-9_-]+/gi, 'Bearer ***');

  // Mask email addresses (optional - can be disabled if emails are not considered sensitive)
  // result = result.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '***@***.***');

  return result;
}
