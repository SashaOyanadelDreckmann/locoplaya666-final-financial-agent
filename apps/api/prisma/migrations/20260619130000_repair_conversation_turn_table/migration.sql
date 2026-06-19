-- Repair: production DB may have init migration marked applied without ConversationTurn.
CREATE TABLE IF NOT EXISTS "ConversationTurn" (
  "id" VARCHAR(200) PRIMARY KEY,
  "userId" VARCHAR(128) NOT NULL,
  "sessionId" VARCHAR(200),
  "chatId" VARCHAR(80) NOT NULL,
  "clientMessageId" VARCHAR(200) NOT NULL,
  "userMessage" TEXT NOT NULL,
  "assistantMessage" TEXT NOT NULL,
  "history" JSONB,
  "inputPayload" JSONB,
  "responsePayload" JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "ConversationTurn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ConversationTurn_userId_chatId_clientMessageId_key"
  ON "ConversationTurn" ("userId", "chatId", "clientMessageId");

CREATE INDEX IF NOT EXISTS "ConversationTurn_userId_sessionId_createdAt_idx"
  ON "ConversationTurn" ("userId", "sessionId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "ConversationTurn_userId_chatId_createdAt_idx"
  ON "ConversationTurn" ("userId", "chatId", "createdAt" DESC);

CREATE OR REPLACE FUNCTION set_conversation_turn_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_conversation_turn_updated_at ON "ConversationTurn";
CREATE TRIGGER trigger_set_conversation_turn_updated_at
BEFORE UPDATE ON "ConversationTurn"
FOR EACH ROW
EXECUTE FUNCTION set_conversation_turn_updated_at();
