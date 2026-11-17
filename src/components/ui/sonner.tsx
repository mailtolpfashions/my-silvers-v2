"use client"

import { useSyncExternalStore } from "react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

/**
 * Phones get toasts at the TOP. At the bottom-right they sat exactly over the
 * product page's fixed Add to cart / Buy now bar, so "Added to cart" hid the
 * very buttons a shopper reaches for next, for five seconds. Desktop keeps the
 * position the caller asked for — there is no bar there to cover.
 */
const PHONE = "(max-width: 767px)"
function subscribe(onChange: () => void) {
  const mq = window.matchMedia(PHONE)
  mq.addEventListener("change", onChange)
  return () => mq.removeEventListener("change", onChange)
}
const isPhone = () => window.matchMedia(PHONE).matches
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

// Pinned light: the site ships a single light theme, so this no longer reads
// next-themes. Sonner defaults to "system", which would render dark toasts on a
// light page for anyone whose OS prefers dark.
const Toaster = ({ ...props }: ToasterProps) => {
  const phone = useSyncExternalStore(subscribe, isPhone, () => false)
  return (
    <Sonner
      theme="light"
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          /**
           * Ink ground, not a white card.
           *
           * A toast is a storefront surface, and the storefront's rule is that
           * anything framing an image or an action is square — see the note on
           * --radius in globals.css. This was inheriting the FORM-CONTROL
           * radius, so a notification arrived wearing the shape of an input.
           *
           * Inverting it to ink is what lets it be square without reading as a
           * stray box: it lifts off the page by tone rather than by a border
           * and a shadow, which is the same way the footer separates itself.
           */
          "--normal-bg": "var(--black)",
          "--normal-text": "var(--white)",
          "--normal-border": "var(--black)",
          "--border-radius": "0",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
      position={phone ? "top-center" : props.position}
    />
  )
}

export { Toaster }
