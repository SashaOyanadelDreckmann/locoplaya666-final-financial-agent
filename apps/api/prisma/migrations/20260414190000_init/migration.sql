-- Initial Postgres schema for Financial Agent API
-- Includes users, sessions, and financial profiles with integrity constraints.

CREATE TYPE "UserRole" AS ENUM ('USER', 'ANALYST', 'ADMIN');

CREATE TABLE "User" (
  "id" VARCHAR(128) PRIMARY KEY,
  "name" VARCHAR(200) NOT NULL,
  "email" VARCHAR(320) NOT NULL,
  "passwordHash" VARCHAR(200) NOT NULL,
  "role" "UserRole" NOT NULL DEFAULT 'USER',
  "injectedProfile" JSONB,
  "injectedIntake" JSONB,
  "latestDiagnosticProfileId" VARCHAR(200),
  "latestDiagnosticCompletedAt" TIMESTAMPTZ,
  "panelState" JSONB,
  "sheets" JSONB,
  "knowledgeBaseScore" INTEGER NOT NULL DEFAULT 0 CHECK ("knowledgeBaseScore" >= 0 AND "knowledgeBaseScore" <= 100),
  "knowledgeScore" INTEGER NOT NULL DEFAULT 0 CHECK ("knowledgeScore" >= 0 AND "knowledgeScore" <= 100),
  "knowledgeHistory" JSONB,
  "knowledgeLastUpdated" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "memoryBlob" JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX "User_email_key" ON "User" ("email");
CREATE INDEX "User_createdAt_idx" ON "User" ("createdAt");
CREATE INDEX "User_knowledgeScore_idx" ON "User" ("knowledgeScore");

CREATE TABLE "Session" (
  "tokenHash" VARCHAR(128) PRIMARY KEY,
  "userId" VARCHAR(128) NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "lastSeenAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "rotatedFromHash" VARCHAR(128),
  CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE INDEX "Session_userId_idx" ON "Session" ("userId");
CREATE INDEX "Session_expiresAt_idx" ON "Session" ("expiresAt");

CREATE TABLE "FinancialProfile" (
  "id" VARCHAR(200) PRIMARY KEY,
  "userId" VARCHAR(128) NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "FinancialProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE INDEX "FinancialProfile_userId_createdAt_idx" ON "FinancialProfile" ("userId", "createdAt" DESC);

-- Keep updatedAt current on every user update
CREATE OR REPLACE FUNCTION set_user_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_user_updated_at
BEFORE UPDATE ON "User"
FOR EACH ROW
EXECUTE FUNCTION set_user_updated_at();
