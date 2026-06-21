#!/usr/bin/env tsx
/**
 * Idempotent backfill: sends "cuenta aprobada" emails to approved users
 * who have not yet received the confirmation (tracked in user.memoryBlob).
 *
 * Usage (production):
 *   DATABASE_URL=... RESEND_API_KEY=... WEB_ORIGIN=... APPROVAL_EMAIL_FROM=... \
 *     pnpm exec tsx scripts/qa/resend-approved-account-emails.ts
 */
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  // Script runs outside the API server — use test mode to skip production boot gates.
  process.env.NODE_ENV = 'test';
  if (!process.env.WEB_ORIGIN?.trim()) {
    process.env.WEB_ORIGIN = 'https://financieramente.up.railway.app';
  }
  if (!process.env.APPROVAL_EMAIL_FROM?.trim()) {
    process.env.APPROVAL_EMAIL_FROM = 'Financieramente <onboarding@financieramente.app>';
  }
  if (!process.env.SESSION_TOKEN_SECRET?.trim()) {
    process.env.SESSION_TOKEN_SECRET = 'backfill-script-session-secret-with-32-chars';
  }
  if (!process.env.APPROVAL_LINK_SECRET?.trim()) {
    process.env.APPROVAL_LINK_SECRET = 'backfill-script-approval-secret-with-32-chars';
  }
  if (!process.env.PASSWORD_RESET_LINK_SECRET?.trim()) {
    process.env.PASSWORD_RESET_LINK_SECRET = 'backfill-script-password-reset-secret-32c';
  }

  const { resendPendingApprovalConfirmationEmails } = await import(
    '../../apps/api/src/services/approval.service'
  );

  const report = await resendPendingApprovalConfirmationEmails();
  console.log(JSON.stringify(report, null, 2));

  if (report.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
