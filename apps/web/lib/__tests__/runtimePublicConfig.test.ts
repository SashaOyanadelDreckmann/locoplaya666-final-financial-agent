/** @jest-environment node */

import {
  buildRuntimePublicConfig,
  buildRuntimePublicConfigScript,
  normalizeApiOrigin,
  readApiOriginFromProcessEnv,
} from '../runtimePublicConfig';

describe('runtimePublicConfig', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  it('reads API origin from NEXT_PUBLIC_API_URL', () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.prod.example/';
    expect(readApiOriginFromProcessEnv()).toBe('https://api.prod.example');
  });

  it('adds https:// when NEXT_PUBLIC_API_ORIGIN is only a hostname', () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    process.env.NEXT_PUBLIC_API_ORIGIN = 'api-host.example.com';
    expect(readApiOriginFromProcessEnv()).toBe('https://api-host.example.com');
    expect(normalizeApiOrigin('api-host.example.com')).toBe('https://api-host.example.com');
  });

  it('builds runtime script payload for the browser', () => {
    process.env.NEXT_PUBLIC_API_ORIGIN = 'https://api-origin.example';
    expect(buildRuntimePublicConfig()).toEqual({ apiOrigin: 'https://api-origin.example' });
    expect(buildRuntimePublicConfigScript()).toContain('https://api-origin.example');
  });
});
