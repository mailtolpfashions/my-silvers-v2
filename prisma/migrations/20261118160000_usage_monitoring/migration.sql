-- Free-plan usage monitoring (Nov 2026): the site counts its own email sends
-- (Resend exposes no usage figures) and keeps the daily usage check's readings.

CREATE TABLE "EmailSend" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "recipients" INTEGER NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailSend_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EmailSend_createdAt_idx" ON "EmailSend"("createdAt");

CREATE TABLE "UsageCheck" (
    "id" TEXT NOT NULL,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "meters" JSONB NOT NULL,
    CONSTRAINT "UsageCheck_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "UsageCheck_takenAt_idx" ON "UsageCheck"("takenAt");
