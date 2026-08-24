import { test, expect } from "@playwright/test";
import crypto from "node:crypto";
import { WEBHOOK_TEST_SECRET } from "../playwright.config";

/**
 * Razorpay webhook — signature verification.
 *
 * This is the shortest path from a stranger's HTTP request to a fulfilled
 * order. `/api/webhooks/razorpay` is unauthenticated by necessity (Razorpay
 * cannot hold a session), so the HMAC over the raw body is the only thing
 * standing between the internet and free jewellery. Everything here exists to
 * prove that control cannot be walked around.
 *
 * The suite signs with the same secret the test server was started with — see
 * WEBHOOK_TEST_SECRET in playwright.config.ts. The real one is whatever
 * Razorpay issues and never appears here.
 *
 * Note on assertions: a REJECTED webhook must be 400. An ACCEPTED one that
 * cannot find its order is deliberately 200 — the route acks permanent
 * outcomes so Razorpay stops retrying. So "200" here never means "an order was
 * fulfilled"; it means "the signature was believed". The two are tested apart.
 */

function sign(body: string, secret = WEBHOOK_TEST_SECRET): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

function paymentCaptured(orderId: string, paymentId: string): string {
  return JSON.stringify({
    event: "payment.captured",
    payload: { payment: { entity: { id: paymentId, order_id: orderId } } },
  });
}

const ENDPOINT = "/api/webhooks/razorpay";

test.describe("razorpay webhook rejects what it cannot verify", () => {
  test("refuses a request with no signature header at all", async ({ request }) => {
    const body = paymentCaptured("order_unsigned", "pay_unsigned");

    const response = await request.post(ENDPOINT, {
      headers: { "content-type": "application/json" },
      data: body,
    });

    expect(response.status(), "an unsigned webhook was not refused").toBe(400);
  });

  test("refuses a forged signature", async ({ request }) => {
    const body = paymentCaptured("order_forged", "pay_forged");

    const response = await request.post(ENDPOINT, {
      headers: {
        "content-type": "application/json",
        "x-razorpay-signature": sign(body, "attacker-guessed-this-secret"),
      },
      data: body,
    });

    expect(response.status(), "a webhook signed with the wrong secret was accepted").toBe(400);
  });

  test("refuses a signature that is well-formed but wrong", async ({ request }) => {
    const body = paymentCaptured("order_wrong_sig", "pay_wrong_sig");

    // Correct length and alphabet — the failure must come from the comparison,
    // not from the hex decode throwing.
    const response = await request.post(ENDPOINT, {
      headers: {
        "content-type": "application/json",
        "x-razorpay-signature": "a".repeat(64),
      },
      data: body,
    });

    expect(response.status()).toBe(400);
  });

  test("refuses non-hex rubbish in the signature header", async ({ request }) => {
    const body = paymentCaptured("order_rubbish", "pay_rubbish");

    // timingSafeHexEqual has to survive a Buffer.from(..., "hex") that cannot
    // parse, rather than 500-ing. A crash here would be a denial-of-service on
    // the fulfilment path.
    const response = await request.post(ENDPOINT, {
      headers: {
        "content-type": "application/json",
        "x-razorpay-signature": "not-a-hex-signature!!",
      },
      data: body,
    });

    expect(response.status(), "malformed signature should be refused, not crash").toBe(400);
    expect(response.status()).not.toBe(500);
  });

  test("refuses a body tampered with after signing", async ({ request }) => {
    // The exact attack the raw-body requirement exists to stop: take a
    // legitimately signed payload, swap the order it points at, keep the
    // signature.
    const original = paymentCaptured("order_original", "pay_original");
    const signature = sign(original);
    const tampered = paymentCaptured("order_swapped_in", "pay_original");

    const response = await request.post(ENDPOINT, {
      headers: {
        "content-type": "application/json",
        "x-razorpay-signature": signature,
      },
      data: tampered,
    });

    expect(response.status(), "a tampered body kept its original signature").toBe(400);
  });

  test("refuses a signature from a re-serialized body", async ({ request }) => {
    // Semantically identical JSON, different bytes. If verification ever moved
    // to JSON.stringify(JSON.parse(body)) this would start passing — and the
    // route's raw-body guarantee would be quietly gone.
    const body = paymentCaptured("order_reserialized", "pay_reserialized");
    const reserialized = JSON.stringify(JSON.parse(body), null, 2);

    const response = await request.post(ENDPOINT, {
      headers: {
        "content-type": "application/json",
        "x-razorpay-signature": sign(reserialized),
      },
      data: body,
    });

    expect(response.status()).toBe(400);
  });
});

test.describe("razorpay webhook accepts what it can verify", () => {
  test("believes a correctly signed payload", async ({ request }) => {
    const body = paymentCaptured("order_valid_but_unknown", "pay_valid_but_unknown");

    const response = await request.post(ENDPOINT, {
      headers: {
        "content-type": "application/json",
        "x-razorpay-signature": sign(body),
      },
      data: body,
    });

    // The order does not exist, so fulfilment raises a PaymentError and the
    // route acks it — a retry would never succeed. What matters here is that it
    // got PAST the signature gate, i.e. is not a 400.
    expect(response.status(), "a correctly signed webhook was refused").not.toBe(400);
    expect(response.status()).toBeLessThan(500);
  });

  test("refuses a malformed body even when the signature matches it", async ({ request }) => {
    const body = "{ this is not json";

    const response = await request.post(ENDPOINT, {
      headers: {
        "content-type": "application/json",
        "x-razorpay-signature": sign(body),
      },
      data: body,
    });

    expect(response.status()).toBe(400);
  });

  test("acknowledges an unknown event type without acting on it", async ({ request }) => {
    const body = JSON.stringify({
      event: "subscription.charged",
      payload: { payment: { entity: { id: "pay_x", order_id: "order_x" } } },
    });

    const response = await request.post(ENDPOINT, {
      headers: {
        "content-type": "application/json",
        "x-razorpay-signature": sign(body),
      },
      data: body,
    });

    // Acked, not errored — an unrecognised event must not make Razorpay retry
    // forever.
    expect(response.status()).toBeLessThan(400);
  });
});

test.describe("shiprocket webhook", () => {
  test("refuses a request with no shared token", async ({ request }) => {
    const response = await request.post("/api/webhooks/shiprocket", {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({ awb: "000000", current_status: "Delivered" }),
    });

    expect(response.status(), "an untokened tracking webhook was accepted").toBeGreaterThanOrEqual(
      400
    );
  });

  test("refuses a wrong shared token", async ({ request }) => {
    const response = await request.post("/api/webhooks/shiprocket", {
      headers: {
        "content-type": "application/json",
        "x-api-key": "not-the-configured-token",
      },
      data: JSON.stringify({ awb: "000000", current_status: "Delivered" }),
    });

    expect(response.status()).toBeGreaterThanOrEqual(400);
  });
});

test.describe("cron endpoint", () => {
  test("refuses an unauthenticated sweep", async ({ request }) => {
    // This endpoint issues refunds. It must never run for anyone but Vercel.
    const response = await request.get("/api/cron/auto-refund-sweep");
    expect(response.status()).toBe(401);
  });

  test("refuses a wrong bearer token", async ({ request }) => {
    const response = await request.get("/api/cron/auto-refund-sweep", {
      headers: { authorization: "Bearer not-the-cron-secret" },
    });
    expect(response.status()).toBe(401);
  });
});
