import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('health.service', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NODE_ENV = 'test';
    process.env.SESSION_TOKEN_SECRET = 'test-session-secret-with-32-characters-min';
    process.env.WEB_ORIGIN = 'http://localhost:3000';
    delete process.env.DATABASE_URL;
    delete process.env.RESEND_API_KEY;
    delete process.env.DATA_DIR;
  });

  it('reports artifact storage as writable in test', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fa-health-'));
    process.env.DATA_DIR = tmpDir;
    vi.resetModules();

    const { getReadinessReport } = await import('./health.service');
    const report = await getReadinessReport();

    expect(report.checks.artifactStorage.status).toBe('ok');
    expect(report.checks.artifactStorage.writable).toBe(true);
    expect(report.checks.artifactStorage.path).toBe(path.resolve(tmpDir));
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
    process.env.APPROVAL_EMAIL_FROM = 'Financieramente <onboarding@financieramente.app>';
    vi.resetModules();

    const { getApprovalEmailCheck, getReadinessReport } = await import('./health.service');

    expect(getApprovalEmailCheck().status).toBe('ok');

    const report = await getReadinessReport();
    expect(report.checks.approvalEmail.status).toBe('ok');
    expect(report.status).toBe('ok');
  });

  it('reports degraded approval email when FROM uses resend.dev sandbox', async () => {
    process.env.RESEND_API_KEY = 're_test_key';
    process.env.APPROVAL_EMAIL_FROM = 'Financieramente <onboarding@resend.dev>';
    vi.resetModules();

    const { getApprovalEmailCheck, getReadinessReport } = await import('./health.service');

    expect(getApprovalEmailCheck().status).toBe('degraded');
    expect(getApprovalEmailCheck().detail).toContain('resend.dev');

    const report = await getReadinessReport();
    expect(report.checks.approvalEmail.status).toBe('degraded');
    expect(report.status).toBe('degraded');
  });
});
