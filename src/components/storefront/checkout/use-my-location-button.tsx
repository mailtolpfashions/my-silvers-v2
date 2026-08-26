"use client";

import { useState } from "react";
import { MapPin, LoaderCircle } from "lucide-react";
import { reverseGeocodeAction, type LocationLookup } from "@/actions/geocode-actions";

export type LocationFill = {
  city: string | null;
  state: string | null;
  pincode: string | null;
};

/**
 * "Use my current location" — fills city, state and pincode from the device.
 *
 * ── What this deliberately is not ────────────────────────────────────────────
 * It does not fill the street address, and it does not show a map. A phone's
 * coordinates are accurate to somewhere between ten metres and half a kilometre
 * depending on whether GPS or the cell tower answered, which is ample for
 * "which town and which pincode" and nowhere near enough for "which house".
 * Writing a confident-looking street address the shopper then has to notice is
 * wrong is worse than leaving the field empty for them to fill.
 *
 * So: the three fields a courier routes on get filled, the shopper types the
 * part only they know, and the whole thing stays a shortcut rather than an
 * authority.
 *
 * ── Why it also fixes a bug ──────────────────────────────────────────────────
 * State and pincode now arrive from ONE source instead of being typed
 * independently, so they cannot contradict each other — which is exactly the
 * Punjab-with-a-Chennai-pincode order that prompted this.
 */
export function UseMyLocationButton({
  onFill,
  disabled,
}: {
  onFill: (fill: LocationFill) => void;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick() {
    setMessage(null);

    if (!("geolocation" in navigator)) {
      setMessage("This browser can't share your location. Please type your address.");
      return;
    }

    setBusy(true);
    try {
      const position = await currentPosition();
      const result = await reverseGeocodeAction(
        position.coords.latitude,
        position.coords.longitude
      );
      applyResult(result);
    } catch (err) {
      setMessage(geolocationMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function applyResult(result: LocationLookup) {
    if (result.status === "outside-india") {
      setMessage("You seem to be outside India. We only deliver within India — please type an Indian address.");
      return;
    }
    if (result.status === "no-address" || result.status === "unavailable") {
      setMessage("We couldn't work out your address. Please type it in.");
      return;
    }

    // Nothing usable came back. Saying "found it" while the form sits unchanged
    // is the one outcome guaranteed to confuse.
    if (!result.city && !result.state && !result.pincode) {
      setMessage("We couldn't work out your address. Please type it in.");
      return;
    }

    onFill(result);

    /**
     * Tell them exactly what was filled and what still needs them.
     *
     * A partial fill is the common case outside big cities — Google often has
     * the district but no postal code — and a shopper who is told "location
     * added" will not go looking for the empty field they now have to complete.
     */
    const missing: string[] = [];
    if (!result.city) missing.push("city");
    if (!result.state) missing.push("state");
    if (!result.pincode) missing.push("pincode");

    setMessage(
      missing.length === 0
        ? "Address filled in — check it and add your street below."
        : `Filled in what we could. Please add your ${formatList(missing)}.`
    );
  }

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy || disabled}
        className="inline-flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-60"
      >
        {busy ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
        ) : (
          <MapPin className="size-4" aria-hidden />
        )}
        {busy ? "Finding your location…" : "Use my current location"}
      </button>

      {/* aria-live so the outcome reaches a screen reader: the visible feedback
          for this button is text appearing elsewhere on the page, which is
          otherwise silent. */}
      <p aria-live="polite" className="text-xs text-muted-foreground empty:hidden">
        {message}
      </p>
    </div>
  );
}

/**
 * getCurrentPosition as a promise.
 *
 * `timeout` matters on mobile: without it the callback can hang indefinitely
 * indoors while the GPS never gets a fix, leaving the button spinning forever.
 * `maximumAge` allows a recent fix rather than forcing a fresh one, which is
 * both faster and kinder to the battery — an address does not need a
 * second-fresh position.
 */
function currentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 10_000,
      maximumAge: 120_000,
    });
  });
}

/**
 * The browser's refusal, in words a shopper can act on.
 *
 * PERMISSION_DENIED is the one that needs care. It is not an error — it is a
 * choice, and a reasonable one — so it must not read like something broke, and
 * it must not nag. It says where the setting lives and then gets out of the
 * way.
 */
function geolocationMessage(err: unknown): string {
  if (typeof GeolocationPositionError !== "undefined" && err instanceof GeolocationPositionError) {
    switch (err.code) {
      case err.PERMISSION_DENIED:
        return "No problem — location is off for this site. You can turn it on in your browser's address bar, or just type your address below.";
      case err.POSITION_UNAVAILABLE:
        return "Your device couldn't get a location fix. Please type your address.";
      case err.TIMEOUT:
        return "That took too long. Please type your address, or try again outdoors.";
    }
  }
  return "We couldn't get your location. Please type your address.";
}

/** "city and pincode", "city, state and pincode". */
function formatList(items: string[]): string {
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
