-- Per-user fincoin spend tracking (USD source of truth, 250 fincoins = $1.6, $2 hard cap)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "usdSpentTotal" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "fincoinDepletedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "fincoinDepletionHandled" BOOLEAN NOT NULL DEFAULT false;
