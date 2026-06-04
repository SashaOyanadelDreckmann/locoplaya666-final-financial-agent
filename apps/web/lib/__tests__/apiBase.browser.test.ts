/** @jest-environment jsdom */

import { getApiBaseUrl, getUploadApiBaseUrl } from '../apiBase';

describe('apiBase browser production', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'production',
      configurable: true,
      writable: true,
    });
    delete (window as Window & { __FA_RUNTIME__?: { apiOrigin: string } }).__FA_RUNTIME__;
  });

  afterAll(() => {
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: originalNodeEnv,
      configurable: true,
      writable: true,
    });
  });

  it('getApiBaseUrl uses runtime-injected apiOrigin before /backend fallback', () => {
    window.__FA_RUNTIME__ = { apiOrigin: 'https://runtime-api.example.com' };
    expect(getApiBaseUrl()).toBe('https://runtime-api.example.com');
    expect(getUploadApiBaseUrl()).toBe('https://runtime-api.example.com');
  });

  it('getApiBaseUrl falls back to /backend when no direct origin is configured', () => {
    expect(getApiBaseUrl()).toBe('/backend');
  });
});
