const nextJest = require('next/jest')

const createJestConfig = nextJest({
  dir: './',
})

const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^canvas$': '<rootDir>/test/canvasMock.js',
  },
  modulePathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/coverage/'],
  testPathIgnorePatterns: [
    '<rootDir>/.next/',
    '<rootDir>/coverage/',
    // Playwright e2e — require @playwright/test; run separately, not in Jest CI
    '<rootDir>/app/intake/__tests__/intake-e2e.ts',
    '\\.e2e\\.test\\.[jt]sx?$',
  ],
  watchPathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/coverage/'],
  testMatch: [
    '**/__tests__/**/*.[jt]s?(x)',
    '**/?(*.)+(spec|test).[jt]s?(x)',
  ],
  collectCoverageFrom: [
    'app/**/*.{js,jsx,ts,tsx}',
    'components/**/*.{js,jsx,ts,tsx}',
    'lib/**/*.{js,jsx,ts,tsx}',
    'state/**/*.{js,jsx,ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/.next/**',
  ],
}

module.exports = createJestConfig(customJestConfig)
