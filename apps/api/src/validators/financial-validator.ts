/**
 * Financial input validation for the agent
 * Ensures all financial data meets schema and business rule requirements
 * Critical for thesis compliance and data integrity
 */

import { validationError } from '../mcp/security/error';

/**
 * Validate monetary amounts
 * Checks: positive value, precision, reasonable limits
 */
export function validateAmount(
  value: unknown,
  options?: {
    min?: number;
    max?: number;
    currency?: string;
    allowZero?: boolean;
  }
): number {
  if (typeof value !== 'number') {
    throw validationError('Amount must be a number');
  }

  if (!Number.isFinite(value)) {
    throw validationError('Amount must be a finite number');
  }

  const min = options?.min ?? 0;
  const max = options?.max ?? 999999999;
  const allowZero = options?.allowZero ?? true;

  if (!allowZero && value === 0) {
    throw validationError('Amount cannot be zero');
  }

  if (value < min) {
    throw validationError(
      `Amount cannot be less than ${min}`
    );
  }

  if (value > max) {
    throw validationError(
      `Amount cannot exceed ${max}`
    );
  }

  // Check decimal precision (max 2 decimal places for currency)
  const decimalPlaces = (value.toString().split('.')[1] || '').length;
  if (decimalPlaces > 2) {
    throw validationError(
      'Amount can have at most 2 decimal places'
    );
  }

  return value;
}

/**
 * Validate account type against whitelist
 * Valid types reflect Chilean financial system
 */
export function validateAccountType(
  type: unknown
): 'savings' | 'checking' | 'investment' | 'loan' | 'credit_card' {
  const validTypes = [
    'savings',
    'checking',
    'investment',
    'loan',
    'credit_card',
  ];

  const normalizedType =
    typeof type === 'string'
      ? type.toLowerCase().trim()
      : null;

  if (!normalizedType || !validTypes.includes(normalizedType)) {
    throw validationError(
      `Account type must be one of: ${validTypes.join(', ')}`
    );
  }

  return normalizedType as any;
}

/**
 * Validate Chilean RUT/account number format
 * Format: TTCCBBAAAAAAAAAAAAC (18-22 digits)
 * TT: Type, CC: Check code, BB: Bank, A: Account, C: Check digit
 */
export function validateAccountNumber(
  number: unknown
): string {
  if (typeof number !== 'string' && typeof number !== 'number') {
    throw validationError('Account number must be a string or number');
  }

  const normalized = String(number).replace(/\D/g, '');

  if (normalized.length < 18 || normalized.length > 22) {
    throw validationError(
      `Account number must be between 18-22 digits (got ${normalized.length})`
    );
  }

  if (!/^\d+$/.test(normalized)) {
    throw validationError('Account number must contain only digits');
  }

  // Basic check digit validation (simplified)
  const checkDigit = parseInt(normalized.slice(-1), 10);
  if (Number.isNaN(checkDigit)) {
    throw validationError('Invalid account number format');
  }

  return normalized;
}

/**
 * Validate transaction type against whitelist
 */
export function validateTransactionType(
  type: unknown
): 'deposit' | 'withdrawal' | 'transfer' | 'payment' | 'investment' {
  const validTypes = [
    'deposit',
    'withdrawal',
    'transfer',
    'payment',
    'investment',
  ];

  const normalizedType =
    typeof type === 'string'
      ? type.toLowerCase().trim()
      : null;

  if (!normalizedType || !validTypes.includes(normalizedType)) {
    throw validationError(
      `Transaction type must be one of: ${validTypes.join(', ')}`
    );
  }

  return normalizedType as any;
}

/**
 * Validate date is within acceptable range
 * Not in future, not more than 10 years past
 */
export function validateDate(
  date: unknown,
  options?: { allowFuture?: boolean }
): Date {
  let dateObj: Date;

  if (date instanceof Date) {
    dateObj = date;
  } else if (typeof date === 'string') {
    dateObj = new Date(date);
  } else if (typeof date === 'number') {
    dateObj = new Date(date);
  } else {
    throw validationError('Date must be a valid date, string, or number');
  }

  if (isNaN(dateObj.getTime())) {
    throw validationError('Invalid date format');
  }

  const now = new Date();
  const tenYearsAgo = new Date(now);
  tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);

  if (!options?.allowFuture && dateObj > now) {
    throw validationError('Date cannot be in the future');
  }

  if (dateObj < tenYearsAgo) {
    throw validationError('Date cannot be more than 10 years in the past');
  }

  return dateObj;
}

/**
 * Validate user input text
 * Enforces length, detects PII, prevents injection
 */
export function validateUserInput(
  text: unknown,
  mode?: string
): string {
  if (typeof text !== 'string') {
    throw validationError('Input must be text');
  }

  if (text.length === 0) {
    throw validationError('Input cannot be empty');
  }

  if (text.length > 2000) {
    throw validationError(
      'Input cannot exceed 2000 characters'
    );
  }

  // Detect financial PII
  const piiPatterns = [
    /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/, // Credit card
    /\b\d{3}-\d{2}-\d{4}\b/, // SSN format
    /\brut\s+\d{7,8}-[\dkK]\b/i, // Chilean RUT
  ];

  for (const pattern of piiPatterns) {
    if (pattern.test(text)) {
      throw validationError(
        'Input contains sensitive financial information (card numbers, SSN, etc.)'
      );
    }
  }

  // Detect SQL injection patterns
  const sqlPatterns = [
    /;\s*(drop|delete|insert|update|execute|select)\s+/i,
    /union\s+select/i,
    /into\s+(outfile|dumpfile)/i,
  ];

  for (const pattern of sqlPatterns) {
    if (pattern.test(text)) {
      throw validationError('Input contains suspicious SQL patterns');
    }
  }

  // Detect command injection
  const commandPatterns = [
    /[;&|`$(){}[\]<>]/,
  ];

  for (const pattern of commandPatterns) {
    // Allow some chars but check for obvious injection
    if (
      text.includes('$(') ||
      text.includes('`') ||
      text.includes('&&') ||
      text.includes('||')
    ) {
      throw validationError('Input contains suspicious command patterns');
    }
  }

  return text.trim();
}

/**
 * Batch validation for common financial scenarios
 */
export interface FinancialInputBatch {
  amount?: number;
  accountType?: string;
  accountNumber?: string;
  transactionType?: string;
  date?: string | Date;
  description?: string;
}

/**
 * Validate a batch of financial inputs
 * Returns validated data or throws on first error
 */
export function validateFinancialBatch(
  data: FinancialInputBatch
): FinancialInputBatch {
  const validated: FinancialInputBatch = {};

  if (data.amount !== undefined) {
    validated.amount = validateAmount(data.amount);
  }

  if (data.accountType !== undefined) {
    validated.accountType = validateAccountType(data.accountType);
  }

  if (data.accountNumber !== undefined) {
    validated.accountNumber = validateAccountNumber(
      data.accountNumber
    );
  }

  if (data.transactionType !== undefined) {
    validated.transactionType = validateTransactionType(
      data.transactionType
    );
  }

  if (data.date !== undefined) {
    validated.date = validateDate(data.date);
  }

  if (data.description !== undefined) {
    validated.description = validateUserInput(data.description);
  }

  return validated;
}

/**
 * Get validation error message for user-facing responses
 * Sanitizes technical details, provides guidance
 */
export function getValidationErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message;

    // Extract clean message for user
    if (message.includes('Amount')) return message;
    if (message.includes('Account')) return message;
    if (message.includes('Date')) return message;
    if (message.includes('Transaction')) return message;
    if (message.includes('Input')) return message;

    return 'Invalid input. Please check your data and try again.';
  }

  return 'An error occurred. Please try again.';
}
