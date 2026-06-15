import bcrypt from 'bcryptjs';
import { APPROVAL_STATUS } from '../auth/approval';
import { getLogger } from '../logger';
import { attachIntakeToUser, createUser, findUserByEmail, updateUserAuthSecurity } from './user.service';

export const DEV_TEST_USER_PASSWORD = 'Financieramente123!';

export const DEV_TEST_USERS = [
  {
    name: 'QA Desktop Local',
    email: 'qa-desk-local@financieramente.invalid',
    qaChannel: 'desktop' as const,
  },
  {
    name: 'QA Mobile Local',
    email: 'qa-mobile-local@financieramente.invalid',
    qaChannel: 'mobile' as const,
  },
] as const;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hasCompletedDevIntake(
  injectedIntake: { intake?: unknown } | null | undefined,
): boolean {
  const intake = injectedIntake?.intake;
  if (!intake || typeof intake !== 'object') return false;
  const data = intake as Record<string, unknown>;
  return (
    typeof data.employmentStatus === 'string' &&
    data.employmentStatus.length > 0 &&
    typeof data.incomeBand === 'string' &&
    data.incomeBand.length > 0
  );
}

function buildDevTestIntake(account: (typeof DEV_TEST_USERS)[number]) {
  return {
    intake: {
      employmentStatus: 'employed',
      incomeBand: '600k-1M',
      expensesCoverage: 'tight',
      tracksExpenses: 'sometimes',
      hasSavingsOrInvestments: false,
      hasDebt: false,
      financialKnowledge: { interest: false, CAE: false, inflation: false },
      riskReaction: 'hold',
      selfRatedUnderstanding: 4,
      moneyStressLevel: 5,
      qaChannel: account.qaChannel,
    },
    intakeContext: `Perfil QA local (${account.qaChannel}) precargado para desarrollo.`,
  };
}

async function ensureDevTestUserIntake(
  userId: string,
  account: (typeof DEV_TEST_USERS)[number],
): Promise<void> {
  await attachIntakeToUser(userId, buildDevTestIntake(account), { replace: true });
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
      const user = await createUser({
        name: account.name,
        email,
        passwordHash,
        approvalStatus: APPROVAL_STATUS.APPROVED,
        approvedAt,
        approvedByEmail,
      });
      await ensureDevTestUserIntake(user.id, account);
      logger.info({
        msg: 'Dev test user seeded',
        name: account.name,
        email,
      });
      continue;
    }

    const needsApprovalFix = existing.approvalStatus !== APPROVAL_STATUS.APPROVED;
    const passwordOk = await bcrypt.compare(DEV_TEST_USER_PASSWORD, String(existing.passwordHash ?? ''));
    const needsIntake = !hasCompletedDevIntake(existing.injectedIntake);

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

    if (needsIntake) {
      await ensureDevTestUserIntake(existing.id, account);
      logger.info({
        msg: 'Dev test user intake seeded',
        name: account.name,
        email,
      });
    }
  }

  logger.info({
    msg: 'Dev test accounts ready for local QA (login → /agent)',
    password: DEV_TEST_USER_PASSWORD,
    accounts: DEV_TEST_USERS.map((user) => user.email),
  });
}
