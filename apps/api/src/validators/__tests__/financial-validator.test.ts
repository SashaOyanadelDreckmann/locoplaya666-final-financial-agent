/**
 * Comprehensive test suite for financial validator
 * Tests: validation rules, edge cases, security, error messages
 */

import {
  validateAmount,
  validateAccountType,
  validateAccountNumber,
  validateTransactionType,
  validateDate,
  validateUserInput,
  validateFinancialBatch,
} from '../financial-validator';

describe('financial-validator', () => {
  describe('validateAmount', () => {
    test('accepts valid positive amounts', () => {
      expect(validateAmount(100)).toBe(100);
      expect(validateAmount(1000.50)).toBe(1000.5);
      expect(validateAmount(999999999)).toBe(999999999);
    });

    test('accepts zero by default', () => {
      expect(validateAmount(0)).toBe(0);
    });

    test('rejects negative amounts', () => {
      expect(() => validateAmount(-100)).toThrow();
    });

    test('rejects amounts exceeding default max', () => {
      expect(() => validateAmount(1000000000)).toThrow();
    });

    test('respects custom min/max range', () => {
      const validator = () =>
        validateAmount(50, { min: 100, max: 500 });
      expect(validator).toThrow();
    });

    test('rejects non-numeric values', () => {
      expect(() => validateAmount('100')).toThrow();
      expect(() => validateAmount(null)).toThrow();
      expect(() => validateAmount(undefined)).toThrow();
    });

    test('rejects amounts with >2 decimal places', () => {
      expect(() => validateAmount(100.999)).toThrow();
    });

    test('allows exactly 2 decimal places', () => {
      expect(validateAmount(100.99)).toBe(100.99);
    });

    test('rejects NaN and Infinity', () => {
      expect(() => validateAmount(NaN)).toThrow();
      expect(() => validateAmount(Infinity)).toThrow();
    });

    test('rejects zero when allowZero=false', () => {
      expect(() =>
        validateAmount(0, { allowZero: false })
      ).toThrow();
    });
  });

  describe('validateAccountType', () => {
    const validTypes = [
      'savings',
      'checking',
      'investment',
      'loan',
      'credit_card',
    ];

    test('accepts all valid account types', () => {
      validTypes.forEach((type) => {
        expect(validateAccountType(type)).toBe(type);
      });
    });

    test('normalizes case (lowercase)', () => {
      expect(validateAccountType('SAVINGS')).toBe('savings');
      expect(validateAccountType('Checking')).toBe('checking');
    });

    test('trims whitespace', () => {
      expect(validateAccountType('  savings  ')).toBe('savings');
    });

    test('rejects invalid account types', () => {
      expect(() => validateAccountType('unknown')).toThrow();
      expect(() => validateAccountType('cash')).toThrow();
      expect(() => validateAccountType('crypto')).toThrow();
    });

    test('rejects non-string types', () => {
      expect(() => validateAccountType(123)).toThrow();
      expect(() => validateAccountType(null)).toThrow();
    });

    test('rejects empty string', () => {
      expect(() => validateAccountType('')).toThrow();
    });
  });

  describe('validateAccountNumber', () => {
    test('accepts valid Chilean account numbers (18-22 digits)', () => {
      const validNumbers = [
        '123456789012345678',
        '12345678901234567890',
        '1234567890123456789012',
      ];
      validNumbers.forEach((num) => {
        expect(validateAccountNumber(num)).toBeDefined();
      });
    });

    test('accepts numbers with separators (dashes, spaces)', () => {
      const result = validateAccountNumber('1234-5678-9012-345678');
      expect(result).toMatch(/^\d{18,22}$/);
    });

    test('rejects numbers <18 digits', () => {
      expect(() => validateAccountNumber('12345678901234567')).toThrow();
    });

    test('rejects numbers >22 digits', () => {
      expect(() =>
        validateAccountNumber('123456789012345678901234')
      ).toThrow();
    });

    test('rejects non-numeric characters', () => {
      expect(() => validateAccountNumber('123456789abc345678')).toThrow();
    });

    test('rejects non-string/number types', () => {
      expect(() => validateAccountNumber(null)).toThrow();
      expect(() => validateAccountNumber(undefined)).toThrow();
    });

    test('normalizes numeric input', () => {
      const result = validateAccountNumber(123456789012345678);
      expect(result).toBe('123456789012345678');
    });
  });

  describe('validateTransactionType', () => {
    const validTypes = [
      'deposit',
      'withdrawal',
      'transfer',
      'payment',
      'investment',
    ];

    test('accepts all valid transaction types', () => {
      validTypes.forEach((type) => {
        expect(validateTransactionType(type)).toBe(type);
      });
    });

    test('normalizes case', () => {
      expect(validateTransactionType('DEPOSIT')).toBe('deposit');
      expect(validateTransactionType('Withdrawal')).toBe('withdrawal');
    });

    test('rejects invalid transaction types', () => {
      expect(() => validateTransactionType('buy')).toThrow();
      expect(() => validateTransactionType('sale')).toThrow();
    });

    test('rejects non-string types', () => {
      expect(() => validateTransactionType(123)).toThrow();
    });
  });

  describe('validateDate', () => {
    test('accepts valid date string', () => {
      const date = validateDate('2024-01-15');
      expect(date).toBeInstanceOf(Date);
    });

    test('accepts Date object', () => {
      const now = new Date();
      const result = validateDate(now);
      expect(result).toEqual(now);
    });

    test('accepts numeric timestamp', () => {
      const timestamp = Date.now();
      const result = validateDate(timestamp);
      expect(result).toBeInstanceOf(Date);
    });

    test('rejects future dates by default', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      expect(() => validateDate(tomorrow)).toThrow();
    });

    test('allows future dates with option', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const result = validateDate(tomorrow, { allowFuture: true });
      expect(result).toBeInstanceOf(Date);
    });

    test('rejects dates >10 years old', () => {
      const elevenYearsAgo = new Date();
      elevenYearsAgo.setFullYear(
        elevenYearsAgo.getFullYear() - 11
      );
      expect(() => validateDate(elevenYearsAgo)).toThrow();
    });

    test('accepts dates within 10 years', () => {
      const fiveYearsAgo = new Date();
      fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
      expect(() => validateDate(fiveYearsAgo)).not.toThrow();
    });

    test('rejects invalid date strings', () => {
      expect(() => validateDate('not-a-date')).toThrow();
      expect(() => validateDate('2024-13-45')).toThrow();
    });

    test('rejects non-date types', () => {
      expect(() => validateDate(null)).toThrow();
      expect(() => validateDate({})).toThrow();
    });
  });

  describe('validateUserInput', () => {
    test('accepts valid text input', () => {
      const result = validateUserInput('This is a valid input');
      expect(result).toBe('This is a valid input');
    });

    test('trims whitespace', () => {
      const result = validateUserInput('  trimmed  ');
      expect(result).toBe('trimmed');
    });

    test('rejects empty strings', () => {
      expect(() => validateUserInput('')).toThrow();
      expect(() => validateUserInput('   ')).toThrow();
    });

    test('rejects input >2000 characters', () => {
      const longString = 'a'.repeat(2001);
      expect(() => validateUserInput(longString)).toThrow();
    });

    test('allows exactly 2000 characters', () => {
      const limitString = 'a'.repeat(2000);
      expect(() => validateUserInput(limitString)).not.toThrow();
    });

    test('detects credit card numbers', () => {
      expect(() =>
        validateUserInput('My card is 4532-1234-5678-9010')
      ).toThrow();
    });

    test('detects SSN patterns', () => {
      expect(() =>
        validateUserInput('SSN: 123-45-6789')
      ).toThrow();
    });

    test('detects SQL injection attempts', () => {
      expect(() =>
        validateUserInput("; DROP TABLE users;")
      ).toThrow();
      expect(() =>
        validateUserInput("' UNION SELECT * FROM")
      ).toThrow();
    });

    test('detects command injection', () => {
      expect(() =>
        validateUserInput('test $(rm -rf /)')
      ).toThrow();
      expect(() =>
        validateUserInput('test && malicious || command')
      ).toThrow();
    });

    test('rejects non-string input', () => {
      expect(() => validateUserInput(123)).toThrow();
      expect(() => validateUserInput(null)).toThrow();
    });
  });

  describe('validateFinancialBatch', () => {
    test('validates all fields when provided', () => {
      const input = {
        amount: 1000,
        accountType: 'savings',
        accountNumber: '123456789012345678',
        transactionType: 'deposit',
        date: '2024-01-15',
        description: 'Test transfer',
      };

      const result = validateFinancialBatch(input);
      expect(result.amount).toBe(1000);
      expect(result.accountType).toBe('savings');
      expect(result.transactionType).toBe('deposit');
    });

    test('skips undefined fields', () => {
      const input = {
        amount: 500,
        accountType: 'checking',
      };

      const result = validateFinancialBatch(input);
      expect(result).toEqual(input);
    });

    test('throws on first validation error', () => {
      const input = {
        amount: -100, // Invalid
        accountType: 'savings',
      };

      expect(() => validateFinancialBatch(input)).toThrow();
    });

    test('handles empty batch', () => {
      const result = validateFinancialBatch({});
      expect(result).toEqual({});
    });
  });

  describe('Integration & Edge Cases', () => {
    test('validates realistic financial scenario', () => {
      const scenario = validateFinancialBatch({
        amount: 5000.50,
        accountType: 'checking',
        accountNumber: '1234567890123456789',
        transactionType: 'transfer',
        date: '2024-01-15',
        description: 'Monthly rent payment',
      });

      expect(scenario.amount).toBe(5000.5);
      expect(scenario.accountType).toBe('checking');
      expect(scenario.transactionType).toBe('transfer');
    });

    test('rejects zero amount in loan context', () => {
      expect(() =>
        validateAmount(0, { allowZero: false })
      ).toThrow();
    });

    test('validates large but reasonable amount', () => {
      expect(validateAmount(999999999)).toBe(999999999);
    });

    test('boundary: minimum 2-decimal precision', () => {
      expect(validateAmount(0.01)).toBe(0.01);
    });
  });
});
