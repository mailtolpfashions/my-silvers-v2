-- The owner role and the activity log (owner panel, Nov 2026).
--
-- Hand-written, like every migration here — `prisma migrate dev` would drop the
-- generated Product.searchVector column (see the note in schema.prisma).
--
-- ADD VALUE is safe inside migrate deploy's transaction on Postgres 12+; the new
-- value simply can't be USED in the same transaction, and nothing here uses it.

ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'superadmin';

CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorEmail" TEXT NOT NULL,
    "actorRole" "Role" NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "summary" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");
CREATE INDEX "ActivityLog_actorId_createdAt_idx" ON "ActivityLog"("actorId", "createdAt");
CREATE INDEX "ActivityLog_action_createdAt_idx" ON "ActivityLog"("action", "createdAt");

ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
