/**
 * Shiprocket's tracking webhook, at an address Shiprocket will accept.
 *
 * Shiprocket refuses webhook URLs containing "shiprocket", "kartrocket", "sr"
 * or "kr" (their docs, Webhook Specifications) — so /api/webhooks/shiprocket
 * could never be registered. This is the same handler under a neutral name;
 * it is the URL the Courier page tells the owner to paste into Shiprocket.
 */
export { POST } from "@/app/api/webhooks/shiprocket/route";
