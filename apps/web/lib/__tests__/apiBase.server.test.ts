/** @jest-environment node */

import { getServerApiBaseUrl, getUploadApiBaseUrl } from '../apiBase';

describe('apiBase server', () => {
  const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;
  const originalApiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN;

  afterEach(() => {
    if (originalApiUrl === undefined) delete process.env.NEXT_PUBLIC_API_URL;
    else process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
    if (originalApiOrigin === undefined) delete process.env.NEXT_PUBLIC_API_ORIGIN;
    else process.env.NEXT_PUBLIC_API_ORIGIN = originalApiOrigin;
  });

  it('getServerApiBaseUrl uses NEXT_PUBLIC_API_URL', () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.example.com/';
    expect(getServerApiBaseUrl()).toBe('https://api.example.com');
  });

  it('getUploadApiBaseUrl prefers direct API origin from env on server', () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    process.env.NEXT_PUBLIC_API_ORIGIN = 'https://api-origin.example.com';
    expect(getUploadApiBaseUrl()).toBe('https://api-origin.example.com');
  });
});
