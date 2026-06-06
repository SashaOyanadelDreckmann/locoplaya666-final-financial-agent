/** @jest-environment jsdom */

import {
  getApiBaseUrl,
  getDocumentParseRequestUrl,
  getSessionApiBaseUrl,
  getUploadApiBaseUrl,
} from '../apiBase';

describe('apiBase browser', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    delete (window as Window & { __FA_RUNTIME__?: { apiOrigin: string } }).__FA_RUNTIME__;
  });

  afterAll(() => {
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: originalNodeEnv,
      configurable: true,
      writable: true,
    });
  });

  it('getApiBaseUrl uses same-origin /backend in dev browser', () => {
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'development',
      configurable: true,
      writable: true,
    });
    expect(getApiBaseUrl()).toBe('/backend');
    expect(getSessionApiBaseUrl()).toBe('/backend');
  });

  it('getApiBaseUrl uses same-origin /backend in production browser', () => {
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'production',
      configurable: true,
      writable: true,
    });
    window.__FA_RUNTIME__ = { apiOrigin: 'https://runtime-api.example.com' };
    expect(getApiBaseUrl()).toBe('/backend');
    expect(getUploadApiBaseUrl()).toBe('/api/documents/parse');
  });

  it('getSessionApiBaseUrl always uses same-origin /backend for auth cookies', () => {
    window.__FA_RUNTIME__ = { apiOrigin: 'https://runtime-api.example.com' };
    expect(getSessionApiBaseUrl()).toBe('/backend');
  });

  it('getDocumentParseRequestUrl uses same-origin Next route in production', () => {
    window.__FA_RUNTIME__ = { apiOrigin: 'https://runtime-api.example.com' };
    expect(getDocumentParseRequestUrl()).toBe('/api/documents/parse');
  });
});
