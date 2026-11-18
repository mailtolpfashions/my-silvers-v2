import { RequestReturnButton } from "@/components/storefront/orders/request-return-button";
import {
  formatDeadline,
  isReturnWindowOpen,
  returnDeadline,
  windowLength,
} from "@/lib/return-window";
import { whatsappLink } from "@/lib/whatsapp";

/**
 * The return option on a delivered order: the button with its deadline while
 * the window is open, and a plain "closed on" line with a way to reach the
 * shop once it isn't. requestReturn enforces the same window on the server.
 */
export function ReturnOption({
  order,
  hours,
  whatsappNumber,
  guestToken,
}: {
  order: { id: string; orderNumber: string; deliveredAt: Date | null };
  /** settings.returnRequestHours — 0 is no limit. */
  hours: number;
  /** Normalised (91XXXXXXXXXX), or "" to show no WhatsApp link. */
  whatsappNumber: string;
  guestToken?: string;
}) {
  const deadline = returnDeadline(order.deliveredAt, hours);

  if (isReturnWindowOpen(order.deliveredAt, hours)) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <RequestReturnButton orderId={order.id} guestToken={guestToken} />
        {deadline && (
          <span className="text-xs text-muted-foreground">
            Damaged or wrong item? Request a return by {formatDeadline(deadline)}.
          </span>
        )}
      </div>
    );
  }

  return (
    <p className="text-sm text-muted-foreground">
      Returns can be requested within {windowLength(hours)} of delivery — that closed on{" "}
      {formatDeadline(deadline!)}.{" "}
      {whatsappNumber ? (
        <>
          Need help with this order?{" "}
          <a
            href={whatsappLink(whatsappNumber, `Hi, I need help with my order ${order.orderNumber}.`)}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            WhatsApp us
          </a>
          .
        </>
      ) : (
        "Need help with this order? Reply to your order email."
      )}
    </p>
  );
}
