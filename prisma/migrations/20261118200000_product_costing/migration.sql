-- Owner-only product costing by weight (Nov 2026). Its own table, never
-- joined by storefront queries. See ProductCosting in schema.prisma.

CREATE TABLE "ProductCosting" (
    "productId" TEXT NOT NULL,
    "weightGrams" DECIMAL(10,3) NOT NULL,
    "silverRatePerGram" DECIMAL(10,2),
    "makingChargePerGram" DECIMAL(10,2),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductCosting_pkey" PRIMARY KEY ("productId")
);

ALTER TABLE "ProductCosting" ADD CONSTRAINT "ProductCosting_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
