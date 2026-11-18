import { test, expect } from "@playwright/test";
import crypto from "node:crypto";
import { WEBHOOK_TEST_SECRET } from "../playwright.config";
import { E2E_EMAIL_PREFIX, TEST_PASSWORD } from "./helpers/auth";
import {
  createTestUser,
  deleteUser,
  deleteOrdersForUser,
  createTestProduct,
  deleteTestProduct,
  insertOrderWithItem,
  getOrderState,
  getStock,
} from "./helpers/db";

/**
 * What a Razorpay webhook does to a REAL order row — the companion to
 * payments-webhook.spec.ts, which only proves the signature gate.
 *
 * ⚠️  No money moves, and none can. The repo's keys are LIVE keys, so no test
 * here completes a payment. Before marking anything paid the server asks
 * Razorpay itself about the payment (fulfill-order.ts → fetchPaymentDetails);
 * the "captured" case below sends a correctly signed webhook naming a payment
 * that does not exist, which is exactly a forger who somehow had the webhook
 * secret — and proves the second lock holds even then.
 *
 * The happy path (a real capture marking an order paid) needs Razorpay TEST
 * keys and is on the manual checklist in docs/testing.md.
 */

const ENDPOINT = "/api/webhooks/razorpay";
const sign = (body: string) => crypto.createHmac("sha256", WEBHOOK_TEST_SECRET).update(body).digest("hex");

function event(name: string, razorpayOrderId: string, paymentId = `pay_e2e${crypto.randomBytes(6).toString("hex")}`) {
  return JSON.stringify({ event: name, payload: { payment: { entity: { id: paymentId, order_id: razorpayOrderId } } } });
}

async function setup(paymentStatus: "pending" | "paid" = "pending") {
  const email = `${E2E_EMAIL_PREFIX}payflow-${Date.now()}-${crypto.randomBytes(3).toString("hex")}@example.test`;
  const { id: userId } = await createTestUser({ email, password: TEST_PASSWORD, role: "customer" });
  const product = await createTestProduct({ stock: 3, price: 999 });
  const razorpayOrderId = `order_e2e${crypto.randomBytes(6).toString("hex")}`;
  const order = await insertOrderWithItem({
    userId,
    productId: product.id,
    name: product.name,
    price: 999,
    paymentMethod: "razorpay",
    paymentStatus,
    orderStatus: paymentStatus === "paid" ? "confirmed" : "placed",
    razorpayOrderId,
  });
  return {
    userId, product, order, razorpayOrderId,
    cleanup: async () => {
      await deleteOrdersForUser(userId).catch(() => {});
      await deleteUser(userId).catch(() => {});
      await deleteTestProduct(product.id).catch(() => {});
    },
  };
}

test.describe("razorpay webhook against a real order row", () => {
  test("a signed 'captured' for a payment Razorpay never saw does NOT mark the order paid", async ({ request }) => {
    const s = await setup();
    try {
      const body = event("payment.captured", s.razorpayOrderId);
      const res = await request.post(ENDPOINT, {
        headers: { "content-type": "application/json", "x-razorpay-signature": sign(body) },
        data: body,
      });
      expect(res.status(), "signature was refused — this test is not reaching the second check").not.toBe(400);

      const state = await getOrderState(s.order.id);
      expect(state?.paymentStatus, "an order was marked paid on the webhook's word alone").toBe("pending");
      expect(await getStock(s.product.id), "stock moved for a payment that never happened").toBe(3);
    } finally {
      await s.cleanup();
    }
  });

  test("a signed 'failed' marks a pending order as failed", async ({ request }) => {
    const s = await setup();
    try {
      const body = event("payment.failed", s.razorpayOrderId);
      const res = await request.post(ENDPOINT, {
        headers: { "content-type": "application/json", "x-razorpay-signature": sign(body) },
        data: body,
      });
      expect(res.status()).toBe(200);
      await expect.poll(async () => (await getOrderState(s.order.id))?.paymentStatus).toBe("failed");
    } finally {
      await s.cleanup();
    }
  });

  test("a late 'failed' cannot un-pay an order that was already paid", async ({ request }) => {
    // Razorpay can deliver a failed attempt AFTER a later attempt succeeded.
    const s = await setup("paid");
    try {
      const body = event("payment.failed", s.razorpayOrderId);
      await request.post(ENDPOINT, {
        headers: { "content-type": "application/json", "x-razorpay-signature": sign(body) },
        data: body,
      });
      expect((await getOrderState(s.order.id))?.paymentStatus, "a paid order was downgraded").toBe("paid");
    } finally {
      await s.cleanup();
    }
  });

  test("an unsigned 'failed' changes nothing", async ({ request }) => {
    const s = await setup();
    try {
      const body = event("payment.failed", s.razorpayOrderId);
      const res = await request.post(ENDPOINT, { headers: { "content-type": "application/json" }, data: body });
      expect(res.status()).toBe(400);
      expect((await getOrderState(s.order.id))?.paymentStatus).toBe("pending");
    } finally {
      await s.cleanup();
    }
  });

  test("the same 'failed' delivered twice is harmless", async ({ request }) => {
    const s = await setup();
    try {
      const body = event("payment.failed", s.razorpayOrderId);
      for (let i = 0; i < 2; i++) {
        const res = await request.post(ENDPOINT, {
          headers: { "content-type": "application/json", "x-razorpay-signature": sign(body) },
          data: body,
        });
        expect(res.status()).toBe(200);
      }
      expect((await getOrderState(s.order.id))?.paymentStatus).toBe("failed");
    } finally {
      await s.cleanup();
    }
  });
});
