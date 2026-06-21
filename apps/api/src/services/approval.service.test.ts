import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'financial-agent-approval-email-'));
process.env.DATA_DIR = dataDir;
process.env.NODE_ENV = 'test';
process.env.WEB_ORIGIN = 'http://localhost:3001';
process.env.OPENAI_API_KEY = 'test-key';
process.env.ANTHROPIC_API_KEY = 'test-key';
process.env.LOG_LEVEL = 'error';
process.env.RESEND_API_KEY = 're_test_key';
process.env.APPROVAL_EMAIL_FROM = 'Financieramente <onboarding@financieramente.app>';
process.env.APPROVAL_LINK_SECRET = 'test-approval-link-secret-abcdefghijklmnopqrstuvwxyz';
process.env.APPROVAL_LINK_BASE_URL = 'http://localhost:3001';
process.env.APPROVAL_ADMIN_EMAIL = 'sasha.oyanadel@ug.uchile.cl';

const originalFetch = global.fetch;

afterAll(() => {
  global.fetch = originalFetch;
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {}
});

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('approval.service notifications', () => {
  it('approves user even when Resend rejects the notification email', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'Only verified recipients allowed',
    }) as typeof fetch;

    const bcrypt = await import('bcryptjs');
    const { APPROVAL_STATUS } = await import('../auth/approval');
    const { createUser } = await import('./user.service');
    const { approveUserByAdmin } = await import('./approval.service');

    const passwordHash = await bcrypt.hash('Secret123', 12);
    const pending = await createUser({
      name: 'Pending User',
      email: `pending-resend-fail-${Date.now()}@example.com`,
      passwordHash,
      approvalStatus: APPROVAL_STATUS.PENDING_APPROVAL,
    });

    const result = await approveUserByAdmin({
      userId: pending.id,
      adminEmail: 'sasha.oyanadel@ug.uchile.cl',
    });

    expect(result.alreadyApproved).toBe(false);
    expect(result.user.approvalStatus).toBe(APPROVAL_STATUS.APPROVED);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

    it('sends approved notification without throwing when Resend succeeds', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '',
    }) as typeof fetch;

    const { sendApprovedNotificationEmail } = await import('./approval.service');
    const result = await sendApprovedNotificationEmail({
      userEmail: 'approved@example.com',
      userName: 'Approved User',
    });

    expect(result.ok).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1]?.body));
    expect(body.html).toContain('Iniciar sesión');
    expect(body.html).toContain('http://localhost:3001/');
  });
});
