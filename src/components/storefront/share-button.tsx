"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Forward } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Share this page.
 *
 * It shares the LINK and never the photograph, which is the whole trick behind
 * the thumbnail: WhatsApp receives a URL, fetches it, reads the page's `og:`
 * tags and draws the product image itself — alongside the name and price, and
 * still clickable. Attaching the image file instead would send a picture with
 * no product behind it. See src/lib/og-image.ts for the other half.
 *
 * On a phone this opens the system share sheet, where WhatsApp is one of the
 * targets. Desktop browsers mostly have no sheet, so there it copies the link —
 * pasting that into WhatsApp Web unfurls to exactly the same preview.
 */
/** Square and chromeless, to sit beside the wishlist heart. */
const SHAPE = "size-9 rounded-none";

export function ShareButton({
  url,
  title,
  className,
}: {
  /** Path or absolute URL. Resolved against the current origin before sharing. */
  url: string;
  title: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  function showCopied() {
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  }

  async function handleClick() {
    const link = new URL(url, window.location.origin).toString();

    if (typeof navigator.share === "function") {
      try {
        // No `text`: several targets paste it in front of the URL, and a
        // message that does not begin with the link is one some clients then
        // decline to unfurl.
        await navigator.share({ title, url: link });
        return;
      } catch (error) {
        // Dismissing the sheet is not a failure, and must not fall through to
        // copying — a shopper who backed out did not ask for anything.
        if (error instanceof DOMException && error.name === "AbortError") return;
        // Anything else (no share target, blocked by policy) falls through.
      }
    }

    try {
      await navigator.clipboard.writeText(link);
      showCopied();
      toast.success("Link copied");
    } catch {
      toast.error("Could not share this page.");
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn(SHAPE, className)}
      onClick={handleClick}
      aria-label={`Share ${title}`}
    >
      {copied ? <Check /> : <Forward />}
    </Button>
  );
}
