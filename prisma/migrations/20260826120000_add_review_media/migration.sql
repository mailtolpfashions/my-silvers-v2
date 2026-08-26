-- Customer-uploaded photos and video on a review.
--
-- Hand-written, like every migration here: `prisma migrate dev` would drop the
-- generated "searchVector" column on Product. See the note in schema.prisma.

-- Both nullable/defaulted, so every existing review keeps working untouched:
-- a review written before this shipped simply has no media.
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "imageUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "videoUrl" TEXT;
