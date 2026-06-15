import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

describe('health routes', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NODE_ENV = 'test';
    process.env.WEB_ORIGIN = 'http://localhost:3000';
    process.env.SESSION_TOKEN_SECRET = 'test-session-secret-with-32-characters-min';
  });

  it('GET /health returns liveness payload', async () => {
    const { createApp } = await import('../app');
    const app = createApp();

    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.dod).toBeDefined();
  });

  it('GET /health/live returns uptime', async () => {
    const { createApp } = await import('../app');
    const app = createApp();

    const res = await request(app).get('/health/live');

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ok');
    expect(typeof res.body.data.uptimeSec).toBe('number');
  });

  it('GET /health/ready returns readiness without postgres in test', async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    vi.resetModules();

    try {
      const { createApp } = await import('../app');
      const app = createApp();

      const res = await request(app).get('/health/ready');

      expect(res.status).toBe(200);
      expect(res.body.data.ready).toBe(true);
      expect(res.body.data.checks.mcp.status).toBe('ok');
      expect(res.body.data.checks.database.status).toBe('skipped');
      expect(res.body.data.checks.artifactStorage.status).toBe('ok');
    } finally {
      if (previousDatabaseUrl) {
        process.env.DATABASE_URL = previousDatabaseUrl;
      }
    }
  });
});
