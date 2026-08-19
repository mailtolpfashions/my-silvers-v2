-- Review moderation.
--
-- Hand-written, like every migration here: `prisma migrate dev` would drop the
-- generated "searchVector" column on Product. See the note in schema.prisma.

-- Defaults to true so the 	existing reviews stay visible and nothing changes for
-- shoppers on deploy. Moderation is after the fact, not a queue gating every
-- review — see the note on the field.
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "isPublished" BOOLEAN NOT NULL DEFAULT true;

-- The moderation queue reads unpublished-first, newest-first.
CREATE INDEX IF NOT EXISTS "Review_isPublished_createdAt_idx" ON "Review"("isPublished", "createdAt" DESC);
