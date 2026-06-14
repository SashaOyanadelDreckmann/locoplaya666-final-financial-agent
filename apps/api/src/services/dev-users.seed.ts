import bcrypt from 'bcryptjs';
import { APPROVAL_STATUS } from '../auth/approval';
import { getLogger } from '../logger';
import { createUser, findUserByEmail, updateUserAuthSecurity } from './user.service';

export const DEV_TEST_USER_PASSWORD = 'Financieramente123!';

export const DEV_TEST_USERS = [
  {
    name: 'QA Desktop Local',
    email: 'qa-desk-local@financieramente.invalid',
  },
  {
    name: 'QA Mobile Local',
    email: 'qa-mobile-local@financieramente.invalid',
  },
] as const;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function ensureDevTestUsers(): Promise<void> {
  if (process.env.NODE_ENV === 'production') return;
  if (process.env.ENABLE_DEV_TEST_USERS === 'false') return;

  const logger = getLogger();
  const passwordHash = await bcrypt.hash(DEV_TEST_USER_PASSWORD, 12);
  const approvedAt = new Date().toISOString();
  const approvedByEmail = 'dev-seed@financieramente.local';

  for (const account of DEV_TEST_USERS) {
    const email = normalizeEmail(account.email);
    const existing = await findUserByEmail(email);

    if (!existing) {
      await createUser({
        name: account.name,
        email,
        passwordHash,
        approvalStatus: APPROVAL_STATUS.APPROVED,
        approvedAt,
        approvedByEmail,
      });
      logger.info({
        msg: 'Dev test user seeded',
        name: account.name,
        email,
      });
      continue;
    }

    const needsApprovalFix = existing.approvalStatus !== APPROVAL_STATUS.APPROVED;
    const passwordOk = await bcrypt.compare(DEV_TEST_USER_PASSWORD, String(existing.passwordHash ?? ''));
    if (needsApprovalFix || !passwordOk) {
      await updateUserAuthSecurity(existing.id, {
        passwordHash,
        approvalStatus: APPROVAL_STATUS.APPROVED,
        approvedAt,
        approvedByEmail,
      });
      logger.info({
        msg: 'Dev test user refreshed',
        name: account.name,
        email,
      });
    }
  }

  logger.info({
    msg: 'Dev test accounts ready for local QA',
    password: DEV_TEST_USER_PASSWORD,
    accounts: DEV_TEST_USERS.map((user) => user.email),
  });
}
