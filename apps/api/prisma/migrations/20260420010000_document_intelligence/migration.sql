CREATE TYPE "DocumentSource" AS ENUM ('USER_UPLOAD', 'AGENT_GENERATED', 'SYSTEM');

CREATE TYPE "DocumentKind" AS ENUM ('PDF', 'EXCEL', 'CSV', 'IMAGE', 'TEXT', 'REPORT', 'STATEMENT', 'OTHER');

CREATE TYPE "DocumentStatus" AS ENUM ('PARSED', 'INDEXED', 'FAILED');

CREATE TABLE "UserVectorStore" (
  "userId" VARCHAR(128) NOT NULL,
  "vectorStoreId" VARCHAR(200) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserVectorStore_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "UserDocument" (
  "id" VARCHAR(128) NOT NULL,
  "userId" VARCHAR(128) NOT NULL,
  "name" VARCHAR(300) NOT NULL,
  "kind" "DocumentKind" NOT NULL,
  "source" "DocumentSource" NOT NULL DEFAULT 'USER_UPLOAD',
  "mimeType" VARCHAR(200),
  "sizeBytes" INTEGER,
  "textPreview" TEXT,
  "extractedText" TEXT,
  "summary" JSONB,
  "structuredData" JSONB,
  "openaiFileId" VARCHAR(200),
  "vectorStoreId" VARCHAR(200),
  "status" "DocumentStatus" NOT NULL DEFAULT 'PARSED',
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserDocument_userId_createdAt_idx" ON "UserDocument"("userId", "createdAt" DESC);

CREATE INDEX "UserDocument_userId_kind_idx" ON "UserDocument"("userId", "kind");

ALTER TABLE "UserVectorStore"
  ADD CONSTRAINT "UserVectorStore_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserDocument"
  ADD CONSTRAINT "UserDocument_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
