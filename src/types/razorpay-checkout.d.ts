/** Minimal typings for Razorpay's Checkout.js browser global. */
interface RazorpayCheckoutResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayCheckoutOptions {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  handler: (response: RazorpayCheckoutResponse) => void;
  modal?: {
    ondismiss?: () => void;
    /** Razorpay's own "are you sure you want to close?" prompt. */
    confirm_close?: boolean;
    /** Whether Esc closes the payment window. */
    escape?: boolean;
  };
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
}

/** Payload of Checkout.js's "payment.failed" event. */
interface RazorpayPaymentFailedResponse {
  error: {
    code?: string;
    /** Shopper-readable, e.g. "Your payment has been declined by your bank". */
    description?: string;
    reason?: string;
    metadata?: { order_id?: string; payment_id?: string };
  };
}

interface RazorpayCheckoutInstance {
  open: () => void;
  on: (event: "payment.failed", handler: (response: RazorpayPaymentFailedResponse) => void) => void;
}

interface Window {
  Razorpay?: new (options: RazorpayCheckoutOptions) => RazorpayCheckoutInstance;
}
