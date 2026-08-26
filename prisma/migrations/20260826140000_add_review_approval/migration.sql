-- Review approval: a three-state moderation status replacing `isPublished`.
--
-- Hand-written, like every migration here: `prisma migrate dev` would drop the
-- generated "searchVector" column on Product. See the note in schema.prisma.
--
-- ⚠️  The backfill is the important half. New reviews default to `pending`, but
-- applying that default to reviews that ALREADY EXIST would un-publish every
-- review on the shop the moment this deploys — the star averages would drop to
-- zero and the homepage testimonials would empty out, until someone approved
-- them one by one. So existing rows are mapped from what they were:
--
--     isPublished = true   → approved   (it was live; it stays live)
--     isPublished = false  → rejected   (a moderator had already hidden it)
--
-- Nothing lands in `pending` from the backfill. Pending means "written since
-- approval was turned on and not yet looked at", and that is a set that starts
-- empty by definition.

CREATE TYPE "ReviewStatus" AS ENUM ('pending', 'approved', 'rejected');

-- Added WITHOUT the default first, so the backfill below decides every existing
-- row rather than the default silently claiming them as pending.
ALTER TABLE "Review" ADD COLUMN "status" "ReviewStatus";

UPDATE "Review" SET "status" = CASE
  WHEN "isPublished" THEN 'approved'::"ReviewStatus"
  ELSE 'rejected'::"ReviewStatus"
END;

-- Only now is it safe to make it NOT NULL and hand new rows the default.
ALTER TABLE "Review" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "Review" ALTER COLUMN "status" SET DEFAULT 'pending';

DROP INDEX IF EXISTS "Review_isPublished_createdAt_idx";
CREATE INDEX "Review_status_createdAt_idx" ON "Review"("status", "createdAt" DESC);

-- Last, so the backfill above still had something to read from.
ALTER TABLE "Review" DROP COLUMN "isPublished";
