CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED');

ALTER TABLE "User"
ADD COLUMN "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'APPROVED',
ADD COLUMN "approvedAt" TIMESTAMPTZ,
ADD COLUMN "approvedByEmail" VARCHAR(320);

CREATE INDEX "User_approvalStatus_idx" ON "User" ("approvalStatus");
