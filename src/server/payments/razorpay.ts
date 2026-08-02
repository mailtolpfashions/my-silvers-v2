import Razorpay from "razorpay";

let client: Razorpay | null = null;

function razorpay(): Razorpay {
  if (!client) {
    client = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID!,
      key_secret: process.env.RAZORPAY_KEY_SECRET!,
    });
  }
  return client;
}

export async function createRazorpayOrder(amountPaise: number) {
  return razorpay().orders.create({
    amount: amountPaise,
    currency: "INR",
    receipt: `receipt_${Date.now()}`,
  });
}

export async function fetchPaymentDetails(paymentId: string) {
  return razorpay().payments.fetch(paymentId);
}

/** Full refund when amountPaise is omitted. */
export async function createRefund(paymentId: string, amountPaise?: number) {
  return razorpay().payments.refund(
    paymentId,
    amountPaise !== undefined ? { amount: amountPaise } : {}
  );
}
