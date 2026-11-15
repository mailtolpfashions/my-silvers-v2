-- Owner tools (Nov 2026): block a customer account, and a private note on an
-- order. Hand-written, like every migration here — see the note in
-- schema.prisma. Both columns are nullable with no default: metadata-only in
-- Postgres, no table rewrite, nothing for existing rows to do.

ALTER TABLE "User" ADD COLUMN "blockedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "adminNote" TEXT;
