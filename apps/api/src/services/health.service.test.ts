import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('health.service', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NODE_ENV = 'test';
    process.env.SESSION_TOKEN_SECRET = 'test-session-secret-with-32-characters-min';
    process.env.WEB_ORIGIN = 'http://localhost:3000';
    delete process.env.DATABASE_URL;
    delete process.env.RESEND_API_KEY;
  });

  it('reports degraded approval email when RESEND is missing', async () => {
    const { getApprovalEmailCheck, getReadinessReport } = await import('./health.service');

    expect(getApprovalEmailCheck().status).toBe('degraded');

    const report = await getReadinessReport();
    expect(report.ready).toBe(true);
    expect(report.status).toBe('degraded');
    expect(report.checks.approvalEmail.status).toBe('degraded');
  });

  it('reports ok approval email when RESEND is configured', async () => {
    process.env.RESEND_API_KEY = 're_test_key';
    vi.resetModules();

    const { getApprovalEmailCheck, getReadinessReport } = await import('./health.service');

    expect(getApprovalEmailCheck().status).toBe('ok');

    const report = await getReadinessReport();
    expect(report.checks.approvalEmail.status).toBe('ok');
    expect(report.status).toBe('ok');
  });
});
