-- "Complete your payment" reminder (Nov 2026): when it was sent, so an
-- unpaid online order is reminded at most once. Nullable, metadata-only.

ALTER TABLE "Order" ADD COLUMN "paymentReminderSentAt" TIMESTAMP(3);

-- Orders unpaid before this existed are not reminded retroactively: mark the
-- older ones as already handled so the first run doesn't email a backlog.
UPDATE "Order"
SET "paymentReminderSentAt" = CURRENT_TIMESTAMP
WHERE "paymentMethod" = 'razorpay'
  AND "paymentStatus" = 'pending'
  AND "createdAt" < CURRENT_TIMESTAMP - INTERVAL '2 hours';
