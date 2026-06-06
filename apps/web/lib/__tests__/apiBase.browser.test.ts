/** @jest-environment jsdom */

import {
  getApiBaseUrl,
  getDocumentParseRequestUrl,
  getSessionApiBaseUrl,
  getUploadApiBaseUrl,
} from '../apiBase';

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

  it('getApiBaseUrl uses same-origin /backend in production browser', () => {
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
