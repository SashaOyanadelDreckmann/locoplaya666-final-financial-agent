/**
 * helpers.ts
 *
 * Utility functions for testing.
 */

import fs from 'fs';
import path from 'path';
import { vi } from 'vitest';

/**
 * Create a temporary test directory that cleans up automatically.
 * Returns the path and a cleanup function.
 */
export function createTempTestDir(): { dir: string; cleanup: () => void } {
  const baseDir = path.join(__dirname, '../../.test-tmp');
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
  }
  const dir = fs.mkdtempSync(path.join(baseDir, 'run-'));

  return {
    dir,
    cleanup: () => {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    },
  };
}

/**
 * Write test JSON data to a file.
 */
export function writeTestJsonFile(dir: string, filename: string, data: unknown): string {
  const filePath = path.join(dir, filename);
  const fileDir = path.dirname(filePath);

  if (!fs.existsSync(fileDir)) {
    fs.mkdirSync(fileDir, { recursive: true });
  }

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  return filePath;
}

/**
 * Read test JSON data from a file.
 */
export function readTestJsonFile(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

/**
 * Create mock logger for testing.
 */
export const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  child: vi.fn(() => mockLogger),
};

/**
 * Sleep for N milliseconds (for async test operations).
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Assert that a function throws with a specific message pattern.
 */
export async function expectErrorWithMessage(
  fn: () => Promise<void>,
  messagePattern: string | RegExp,
): Promise<void> {
  try {
    await fn();
    throw new Error('Expected function to throw, but it did not');
  } catch (err: any) {
    const message = err?.message || String(err);
    const pattern = messagePattern instanceof RegExp ? messagePattern : new RegExp(messagePattern);

    if (!pattern.test(message)) {
      throw new Error(`Expected error message matching "${pattern}", got: "${message}"`);
    }
  }
}
