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
  process.env.NODE_ENV = process.env.NODE_ENV || 'production';

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
