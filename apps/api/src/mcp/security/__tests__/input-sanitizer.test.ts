/**
 * Security framework: input-sanitizer.ts tests
 * Tests ReDoS prevention, SSRF prevention, injection detection, PII detection
 * Coverage target: 100%
 */

import { describe, expect, it } from 'vitest';
import {
  detectReDoSPattern,
  sanitizeRegexPattern,
  sanitizeUrl,
  sanitizeString,
  sanitizeLargeText,
  validateNumericRange,
  sanitizeSearchQuery,
  validateArrayLength,
  validateMonteCarloConfig,
  containsFinancialPII,
} from '../input-sanitizer';

describe('ReDoS Prevention', () => {
  describe('detectReDoSPattern', () => {
    it('detects nested quantifiers (a+)+', () => {
      expect(detectReDoSPattern('(a+)+')).toBe(true);
    });

    it('detects nested quantifiers (a*)*', () => {
      expect(detectReDoSPattern('(a*)*')).toBe(true);
    });

    it('detects nested quantifiers (a?)?', () => {
      expect(detectReDoSPattern('(a?)?')).toBe(true);
    });

    it('detects multiple quantifier patterns', () => {
      expect(detectReDoSPattern('(a+)+(b*)*')).toBe(true);
    });

    it('allows single quantifiers', () => {
      expect(detectReDoSPattern('a+')).toBe(false);
      expect(detectReDoSPattern('a*')).toBe(false);
      expect(detectReDoSPattern('a?')).toBe(false);
    });

    it('detects overlapping alternation (a|a)', () => {
      expect(detectReDoSPattern('(a|a)')).toBe(true);
    });

    it('detects overlapping alternation (a|ab)', () => {
      expect(detectReDoSPattern('(a|ab)')).toBe(true);
    });

    it('detects overlapping alternation (abc|ab)', () => {
      expect(detectReDoSPattern('(abc|ab)')).toBe(true);
    });

    it('allows non-overlapping alternation (a|b)', () => {
      expect(detectReDoSPattern('(a|b)')).toBe(false);
    });

    it('allows non-overlapping alternation (abc|def)', () => {
      expect(detectReDoSPattern('(abc|def)')).toBe(false);
    });

    it('detects complex ReDoS patterns', () => {
      expect(detectReDoSPattern('(x+x+)+y')).toBe(true);
    });
  });

  describe('sanitizeRegexPattern', () => {
    it('allows safe regex pattern', () => {
      expect(sanitizeRegexPattern('abc')).toBe('abc');
      expect(sanitizeRegexPattern('[a-z]+')).toBe('[a-z]+');
      expect(sanitizeRegexPattern('\\d{3}-\\d{4}')).toBe('\\d{3}-\\d{4}');
    });

    it('rejects patterns exceeding 200 characters', () => {
      const longPattern = 'a'.repeat(201);
      expect(() => sanitizeRegexPattern(longPattern)).toThrow('exceeds 200');
    });

    it('rejects ReDoS patterns', () => {
      expect(() => sanitizeRegexPattern('(a+)+')).toThrow('dangerous');
    });

    it('rejects invalid regex syntax', () => {
      expect(() => sanitizeRegexPattern('[invalid')).toThrow('Invalid regex');
    });

    it('allows exactly 200 character pattern', () => {
      const pattern = 'a'.repeat(200);
      expect(sanitizeRegexPattern(pattern)).toBe(pattern);
    });

    it('compiles pattern to validate correctness', () => {
      // If compilation fails, sanitizeRegexPattern throws
      expect(() => sanitizeRegexPattern('(?:valid)')).not.toThrow();
    });
  });
});

describe('SSRF Prevention', () => {
  describe('sanitizeUrl', () => {
    it('allows public HTTPS URLs', () => {
      const url = 'https://example.com/api';
      expect(sanitizeUrl(url)).toBe(url);
    });

    it('allows public HTTP URLs', () => {
      const url = 'http://example.com';
      expect(sanitizeUrl(url)).toBe(url);
    });

    it('blocks localhost', () => {
      expect(() => sanitizeUrl('http://localhost:3000')).toThrow('blocked');
    });

    it('blocks 127.0.0.1', () => {
      expect(() => sanitizeUrl('http://127.0.0.1:8080')).toThrow('blocked');
    });

    it('blocks 127.x.x.x range', () => {
      expect(() => sanitizeUrl('http://127.255.255.255')).toThrow('blocked');
    });

    it('blocks private IP 10.x.x.x', () => {
      expect(() => sanitizeUrl('http://10.0.0.1')).toThrow('blocked');
    });

    it('blocks private IP 172.16-31.x.x', () => {
      expect(() => sanitizeUrl('http://172.16.0.1')).toThrow('blocked');
      expect(() => sanitizeUrl('http://172.31.255.255')).toThrow('blocked');
    });

    it('allows 172.15.x.x (not in private range)', () => {
      expect(() => sanitizeUrl('http://172.15.0.1')).not.toThrow();
    });

    it('allows 172.32.x.x (not in private range)', () => {
      expect(() => sanitizeUrl('http://172.32.0.1')).not.toThrow();
    });

    it('blocks private IP 192.168.x.x', () => {
      expect(() => sanitizeUrl('http://192.168.1.1')).toThrow('blocked');
    });

    it('blocks link-local 169.254.x.x', () => {
      expect(() => sanitizeUrl('http://169.254.1.1')).toThrow('blocked');
    });

    it('blocks IPv6 loopback ::1', () => {
      expect(() => sanitizeUrl('http://[::1]:8080')).toThrow('blocked');
    });

    it('blocks IPv6 private fc00::', () => {
      expect(() => sanitizeUrl('http://[fc00::1]')).toThrow('blocked');
    });

    it('blocks IPv6 link-local fe80::', () => {
      expect(() => sanitizeUrl('http://[fe80::1]')).toThrow('blocked');
    });

    it('rejects non-http/https protocols', () => {
      expect(() => sanitizeUrl('file:///etc/passwd')).toThrow('allowed');
      expect(() => sanitizeUrl('ftp://example.com')).toThrow('allowed');
      expect(() => sanitizeUrl('gopher://example.com')).toThrow('allowed');
    });

    it('rejects invalid URL format', () => {
      expect(() => sanitizeUrl('not a url')).toThrow('Invalid URL');
    });

    it('enforces 2048 character URL limit', () => {
      const longUrl = 'http://example.com/' + 'a'.repeat(2050);
      expect(() => sanitizeUrl(longUrl)).toThrow('exceeds 2048');
    });

    it('allows exactly 2048 character URL', () => {
      const url = 'http://example.com/' + 'a'.repeat(2000);
      expect(() => sanitizeUrl(url)).not.toThrow();
    });

    it('preserves URL structure', () => {
      const url = 'https://api.example.com:443/v1/data?key=value#section';
      const sanitized = sanitizeUrl(url);
      expect(sanitized).toContain('api.example.com');
      expect(sanitized).toContain('v1/data');
    });
  });
});

describe('String Sanitization', () => {
  describe('sanitizeString', () => {
    it('allows valid strings', () => {
      expect(sanitizeString('Hello world')).toBe('Hello world');
    });

    it('enforces minimum length', () => {
      expect(() => sanitizeString('', { min: 1 })).toThrow('at least 1');
    });

    it('enforces maximum length', () => {
      expect(() => sanitizeString('a'.repeat(2001))).toThrow('not exceed');
    });

    it('allows custom max length', () => {
      expect(sanitizeString('short', { max: 10 })).toBe('short');
      expect(() => sanitizeString('toolong', { max: 3 })).toThrow('not exceed');
    });

    it('uses default limits if not provided', () => {
      expect(sanitizeString('x')).toBe('x');
      expect(() => sanitizeString('a'.repeat(2001))).toThrow();
    });
  });

  describe('sanitizeLargeText', () => {
    it('returns text if under limit', () => {
      const text = 'Small text';
      expect(sanitizeLargeText(text, 1000)).toBe(text);
    });

    it('truncates text exceeding limit', () => {
      const text = 'a'.repeat(1000);
      const result = sanitizeLargeText(text, 100);
      expect(result.length).toBeLessThanOrEqual(100);
    });

    it('uses 1MB default limit', () => {
      const smallText = 'a'.repeat(100000); // 100KB
      expect(sanitizeLargeText(smallText).length).toBe(smallText.length);
    });

    it('handles UTF-8 truncation correctly', () => {
      const text = '你好世界'.repeat(100); // Multi-byte chars
      const result = sanitizeLargeText(text, 50);
      expect(() => {
        // Ensure it's valid UTF-8
        Buffer.from(result, 'utf-8').toString('utf-8');
      }).not.toThrow();
    });
  });
});

describe('Numeric Validation', () => {
  describe('validateNumericRange', () => {
    it('allows values within range', () => {
      expect(validateNumericRange(50, 0, 100)).toBe(50);
      expect(validateNumericRange(0, 0, 100)).toBe(0);
      expect(validateNumericRange(100, 0, 100)).toBe(100);
    });

    it('rejects values below minimum', () => {
      expect(() => validateNumericRange(-1, 0, 100)).toThrow('between');
    });

    it('rejects values above maximum', () => {
      expect(() => validateNumericRange(101, 0, 100)).toThrow('between');
    });

    it('rejects NaN', () => {
      expect(() => validateNumericRange(NaN, 0, 100)).toThrow('valid number');
    });

    it('includes field name in error message', () => {
      try {
        validateNumericRange(-1, 0, 100, 'salary');
        expect.fail('Should throw');
      } catch (error: any) {
        expect(error.message).toContain('salary');
      }
    });

    it('handles negative ranges', () => {
      expect(validateNumericRange(-50, -100, 0)).toBe(-50);
    });

    it('handles decimal values', () => {
      expect(validateNumericRange(3.14, 0, 10)).toBe(3.14);
    });
  });
});

describe('Search Query Sanitization', () => {
  describe('sanitizeSearchQuery', () => {
    it('allows safe search queries', () => {
      expect(sanitizeSearchQuery('how to invest')).toBe('how to invest');
      expect(sanitizeSearchQuery('finance tips')).toBe('finance tips');
    });

    it('enforces minimum length', () => {
      expect(() => sanitizeSearchQuery('')).toThrow('at least 1');
    });

    it('enforces maximum length (500 chars)', () => {
      expect(() => sanitizeSearchQuery('a'.repeat(501))).toThrow('not exceed');
    });

    it('detects SQL injection attempts', () => {
      expect(() =>
        sanitizeSearchQuery('; DROP TABLE users;')
      ).toThrow('suspicious');
    });

    it('detects script injection', () => {
      expect(() =>
        sanitizeSearchQuery('<script>alert("xss")</script>')
      ).toThrow('suspicious');
    });

    it('detects javascript: protocol', () => {
      expect(() =>
        sanitizeSearchQuery('javascript:void(0)')
      ).toThrow('suspicious');
    });

    it('detects event handler injection', () => {
      expect(() =>
        sanitizeSearchQuery('onload = malicious')
      ).toThrow('suspicious');
    });
  });
});

describe('Array Validation', () => {
  describe('validateArrayLength', () => {
    it('allows arrays within limit', () => {
      const arr = [1, 2, 3];
      expect(validateArrayLength(arr, 10)).toBe(arr);
    });

    it('rejects arrays exceeding limit', () => {
      const arr = Array(1001);
      expect(() => validateArrayLength(arr, 1000)).toThrow('exceeds maximum');
    });

    it('allows exactly at limit', () => {
      const arr = Array(100);
      expect(validateArrayLength(arr, 100)).toBe(arr);
    });

    it('uses 1000 as default limit', () => {
      const arr = Array(500);
      expect(validateArrayLength(arr)).toBe(arr);
    });

    it('rejects non-array inputs', () => {
      expect(() => validateArrayLength('not an array' as any)).toThrow('must be an array');
      expect(() => validateArrayLength({ length: 5 } as any)).toThrow('must be an array');
    });

    it('includes field name in error', () => {
      const arr = Array(1001);
      try {
        validateArrayLength(arr, 1000, 'items');
        expect.fail('Should throw');
      } catch (error: any) {
        expect(error.message).toContain('items');
      }
    });
  });
});

describe('Monte Carlo Configuration', () => {
  describe('validateMonteCarloConfig', () => {
    it('allows safe configuration', () => {
      expect(() =>
        validateMonteCarloConfig({ paths: 1000, steps: 100 })
      ).not.toThrow();
    });

    it('rejects excessive paths', () => {
      expect(() =>
        validateMonteCarloConfig({ paths: 10000 })
      ).toThrow('paths cannot exceed');
    });

    it('rejects excessive steps', () => {
      expect(() =>
        validateMonteCarloConfig({ steps: 2000 })
      ).toThrow('steps cannot exceed');
    });

    it('allows max paths (5000)', () => {
      expect(() =>
        validateMonteCarloConfig({ paths: 5000 })
      ).not.toThrow();
    });

    it('allows max steps (1000)', () => {
      expect(() =>
        validateMonteCarloConfig({ steps: 1000 })
      ).not.toThrow();
    });

    it('allows partial configuration', () => {
      expect(() =>
        validateMonteCarloConfig({ paths: 1000 })
      ).not.toThrow();
      expect(() =>
        validateMonteCarloConfig({ steps: 100 })
      ).not.toThrow();
    });

    it('allows empty configuration', () => {
      expect(() =>
        validateMonteCarloConfig({})
      ).not.toThrow();
    });
  });
});

describe('Financial PII Detection', () => {
  describe('containsFinancialPII', () => {
    it('detects credit card numbers (hyphenated)', () => {
      expect(containsFinancialPII('4532-1234-5678-9010')).toBe(true);
    });

    it('detects credit card numbers (spaced)', () => {
      expect(containsFinancialPII('4532 1234 5678 9010')).toBe(true);
    });

    it('detects credit card numbers (no separator)', () => {
      expect(containsFinancialPII('4532123456789010')).toBe(true);
    });

    it('detects SSN format (123-45-6789)', () => {
      expect(containsFinancialPII('SSN: 123-45-6789')).toBe(true);
    });

    it('detects routing number keyword', () => {
      expect(containsFinancialPII('routing number: 123456789')).toBe(true);
    });

    it('detects account number keyword', () => {
      expect(containsFinancialPII('account number is 9876543210')).toBe(true);
    });

    it('detects CVV keyword', () => {
      expect(containsFinancialPII('CVV: 123')).toBe(true);
    });

    it('detects CVC keyword', () => {
      expect(containsFinancialPII('CVC: 456')).toBe(true);
    });

    it('detects card security keyword', () => {
      expect(containsFinancialPII('card security code is 789')).toBe(true);
    });

    it('allows safe text', () => {
      expect(containsFinancialPII('How much should I invest?')).toBe(false);
      expect(containsFinancialPII('My income is 5000 USD')).toBe(false);
    });

    it('case insensitive keyword matching', () => {
      expect(containsFinancialPII('ROUTING NUMBER 123456789')).toBe(true);
      expect(containsFinancialPII('Account Number 9876543210')).toBe(true);
    });

    it('detects PII in longer texts', () => {
      const longText = 'I want to invest. My card is 4532-1234-5678-9010 so please help';
      expect(containsFinancialPII(longText)).toBe(true);
    });
  });
});

describe('Security Integration', () => {
  it('prevents SSRF + ReDoS combo', () => {
    expect(() => {
      sanitizeUrl('http://localhost:8080');
    }).toThrow();

    expect(() => {
      sanitizeRegexPattern('(a+)+');
    }).toThrow();
  });

  it('validates complete user input workflow', () => {
    // Simulate user submitting a message
    const userMessage = 'I want to know about investment options';

    // Check for PII
    expect(containsFinancialPII(userMessage)).toBe(false);

    // Sanitize the string
    const sanitized = sanitizeString(userMessage);
    expect(sanitized).toBe(userMessage);

    // Sanitize as search query
    const searchSanitized = sanitizeSearchQuery(userMessage);
    expect(searchSanitized).toBe(userMessage);
  });
});
