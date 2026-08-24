-- Operational store switches (COD on/off, guest checkout, shipping rates).
--
-- Hand-written, like every migration here: `prisma migrate dev` would drop the
-- generated "searchVector" column on Product. See the note in schema.prisma.

CREATE TABLE IF NOT EXISTS "StoreSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreSetting_pkey" PRIMARY KEY ("key")
);

-- No seed rows on purpose. An absent key means "use the coded default"
-- (see src/server/settings/store-settings.ts), so this table is empty on a
-- fresh database and the shop still starts in a known state: COD off, guest
-- checkout on, ₹49 shipping free over ₹999.
