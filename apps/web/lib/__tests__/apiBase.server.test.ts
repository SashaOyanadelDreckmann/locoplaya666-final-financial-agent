/** @jest-environment node */

import {
  getDocumentParseRequestUrl,
  getInternalApiBaseUrl,
  getServerApiBaseUrl,
} from '../api/base';

describe('apiBase server', () => {
  const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;
  const originalApiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN;
  const originalInternalOrigin = process.env.INTERNAL_API_ORIGIN;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalApiUrl === undefined) delete process.env.NEXT_PUBLIC_API_URL;
    else process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
    if (originalApiOrigin === undefined) delete process.env.NEXT_PUBLIC_API_ORIGIN;
    else process.env.NEXT_PUBLIC_API_ORIGIN = originalApiOrigin;
    if (originalInternalOrigin === undefined) delete process.env.INTERNAL_API_ORIGIN;
    else process.env.INTERNAL_API_ORIGIN = originalInternalOrigin;
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('getServerApiBaseUrl uses NEXT_PUBLIC_API_URL', () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.example.com/';
    expect(getServerApiBaseUrl()).toBe('https://api.example.com');
  });

  it('getDocumentParseRequestUrl points to documents parse on server', () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    process.env.NEXT_PUBLIC_API_ORIGIN = 'https://api-origin.example.com';
    expect(getDocumentParseRequestUrl()).toBe('https://api-origin.example.com/api/documents/parse');
  });

  it('getInternalApiBaseUrl prefers INTERNAL_API_ORIGIN in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.NEXT_PUBLIC_API_URL = 'https://public-api.example.com';
    process.env.INTERNAL_API_ORIGIN = 'http://api.railway.internal:3001';
    expect(getInternalApiBaseUrl()).toBe('http://api.railway.internal:3001');
  });

  it('getInternalApiBaseUrl uses public API origin in production when internal is unset', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.INTERNAL_API_ORIGIN;
    process.env.NEXT_PUBLIC_API_URL = 'https://api.example.com/';
    expect(getInternalApiBaseUrl()).toBe('https://api.example.com');
  });

  it('getInternalApiBaseUrl uses loopback in development even when public URL is LAN', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.INTERNAL_API_ORIGIN;
    process.env.NEXT_PUBLIC_API_URL = 'http://192.168.1.42:3001';
    expect(getInternalApiBaseUrl()).toBe('http://127.0.0.1:3001');
  });

  it('getInternalApiBaseUrl honors INTERNAL_API_ORIGIN in development', () => {
    process.env.NODE_ENV = 'development';
    process.env.INTERNAL_API_ORIGIN = 'http://127.0.0.1:3001';
    process.env.NEXT_PUBLIC_API_URL = 'http://192.168.1.42:3001';
    expect(getInternalApiBaseUrl()).toBe('http://127.0.0.1:3001');
  });
});
