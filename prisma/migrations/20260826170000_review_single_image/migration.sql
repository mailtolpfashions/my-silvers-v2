-- One photo per review, and no video.
--
-- Hand-written, like every migration here: `prisma migrate dev` would drop the
-- generated "searchVector" column on Product. See the note in schema.prisma.
--
-- ⚠️  This DISCARDS data, deliberately and irreversibly:
--
--   * every review video, and
--   * the second and subsequent photos on any review that had more than one.
--
-- Both are gone from the product for good — the review card has a single fixed
-- photo band and nowhere to render either. The order below keeps the first
-- photo before dropping the array that holds it; run it the other way and the
-- surviving photo goes too.
--
-- The Cloudinary assets are NOT deleted by this migration. They become orphans
-- under mysilvers/reviews/ — paid for, unreferenced, and invisible to every
-- screen in the admin. Sweeping them is a separate job against the Cloudinary
-- Admin API, and is safer done after this has been in production long enough to
-- be sure it stays.

ALTER TABLE "Review" ADD COLUMN "imageUrl" TEXT;

-- Postgres arrays are 1-indexed: [1] is the first photo, not [0].
UPDATE "Review"
SET "imageUrl" = "imageUrls"[1]
WHERE array_length("imageUrls", 1) >= 1;

ALTER TABLE "Review" DROP COLUMN "imageUrls";
ALTER TABLE "Review" DROP COLUMN "videoUrl";

-- No index for the photo-first ordering, on purpose. getProductReviews sorts
-- `imageUrl DESC NULLS LAST` then createdAt, and the existing
-- Review_productId_createdAt_idx already narrows to one product's reviews —
-- which for this catalogue is tens of rows, sorted in memory in microseconds.
-- Prisma cannot declare a PARTIAL index either, so adding one here would leave
-- the schema and the database disagreeing. Revisit if a product ever carries
-- thousands of reviews.
