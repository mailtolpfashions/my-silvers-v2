# "Use my current location" at checkout

Fills **city, state and pincode** from the shopper's device. It does not fill the
street address and does not show a map — see [Why no map, no street](#why-no-map-no-street).

Without `GOOGLE_MAPS_API_KEY` set, the button does not render and checkout
behaves exactly as it did before. Nothing else changes.

---

## Setting it up

### 1. Create the key

1. <https://console.cloud.google.com/> → create a project.
2. **Billing** → link a billing account. A card is required even for the free
   tier; Google places a small refundable verification hold. Debit cards work in
   India.
3. **APIs & Services → Library** → enable **Geocoding API**. Only that one.
   Enabling extra APIs widens what a stolen key can spend.
4. **APIs & Services → Credentials** → *Create credentials* → *API key*.

### 2. Restrict the key — do not skip this

On the key's page:

- **Application restrictions:** *None*.
  Correct here, counter-intuitive though it looks. HTTP-referrer restrictions
  are for keys used from a browser; ours is called from the server, where there
  is no referrer. Setting one would break every request.
- **API restrictions:** *Restrict key* → **Geocoding API** only.
  This is the restriction that matters for a server key. A leaked key then buys
  an attacker geocoding and nothing else — no Maps tiles, no Places, no
  Directions, which are the expensive ones.

### 3. Cap the quota — this is what actually stops a bill

**APIs & Services → Geocoding API → Quotas →** set *Requests per day* to
something like **300**.

A hard cap **rejects** calls past the limit. A **budget alert does not** — it
emails you while the spend continues. Set the cap, not just the alert.

At 300/day you would use 9,000 a month against a free allowance of 10,000, so
the cap binds before the bill does. That is the intent: the worst case is the
button failing for a day, not an invoice.

### 4. Add it

```
GOOGLE_MAPS_API_KEY="AIza..."
```

In `.env` locally and in Vercel's environment variables for the deployment.
**Restart the server** — Next reads `.env` at boot.

Note the missing `NEXT_PUBLIC_` prefix. It is missing on purpose: that prefix
inlines a value into the client bundle, which for this key would mean publishing
it.

---

## What it costs

| | |
|---|---|
| Free tier | 10,000 calls/month (Geocoding is in Google's *Essentials* tier) |
| After that | $5 per 1,000, about ₹0.44 a call |
| Calls per use | Exactly one, on a deliberate tap |

At this shop's volume the free tier is roughly 10× more than needed. Expect ₹0.

## The three things stopping abuse

1. **The key is server-side.** The browser sends two numbers to a server action
   and never sees a credential. A scraped-key incident is not possible because
   there is nothing in the bundle to scrape.
2. **Our own rate limiter.** The `geocode` tier — 10 per 15 minutes per IP, in
   `src/server/rate-limit/limiter.ts`. Checked *before* the provider call, so a
   refused request costs nothing.
3. **Google's hard quota cap**, from step 3.

Any one of these would probably be enough. All three means a mistake in one is
not an invoice.

---

## What the key is and is not for

Getting the shopper's coordinates is **free**. `navigator.geolocation` is built
into every browser, costs nothing and needs no account. On an iPhone the
coordinates come from Apple's own location system; on Android, from Google's.
Either way that half is free and has nothing to do with our key.

The key pays for the **second** half: turning `13.0827, 80.2707` into
"Chennai, Tamil Nadu, 600017". That translation is the metered service.

So the device never talks to Google. It hands coordinates to the browser, the
browser posts them to our server, and our server asks Google. An Apple device
needs no Google account, no Google app and no Google permission for this to
work.

## Devices and browsers

Works on Safari (iOS, iPadOS, macOS), Chrome, Firefox and Edge. Three things
are worth knowing:

**https is required.** Geolocation is a secure-context API and every browser
refuses it over plain http — Safari most strictly. The live site is https, so
shoppers never meet this. It bites during **testing**: opening the dev server
from a phone at `http://192.168.x.x:3000` is not a secure context, and the
failure looks identical to the shopper having denied the prompt. `localhost` is
a secure context, so desktop testing works and gives no warning. The button
detects this case and says so rather than letting you chase permissions.

**iOS has two switches, not one.** Safari's own per-site prompt, and
*Settings → Privacy & Security → Location Services → Safari Websites* at the OS
level. If the OS switch is off, Safari's prompt never appears at all and the
call fails immediately. This is the most common "it doesn't work on my iPhone"
cause, and it is not something the site can fix or detect.

**Never name a setting's location in the error copy.** There is no single right
answer across platforms — the address-bar icon exists on desktop Chrome and
nowhere near an iPhone. `geolocationMessage` says "your browser or device
settings" deliberately.

## Why no map, no street

A phone's coordinates land somewhere between ten metres and half a kilometre
from the truth depending on whether GPS or a cell tower answered. That is ample
for *which town and which pincode*, and nowhere near enough for *which house*.

Filling a confident-looking street address the shopper then has to notice is
wrong is worse than leaving it empty for them to type. So the three fields a
courier routes on get filled, and the one only they know stays theirs.

A draggable pin on a real map is the obvious next step, and worth building only
if addresses are still arriving wrong. It costs a Maps JavaScript API key (a
different, browser-side one, with referrer restrictions), map tile billing, and
CSP entries in `next.config.ts` for Google's script, image and connect origins.
None of that is needed today, which is why none of it is there.

## Swapping providers

Everything Google-specific sits below the `GOOGLE` banner in
`src/server/integrations/geocoding.ts`. To move to Mappls or OlaMaps, write
another function returning `ReverseGeocodeResult` and change which one
`reverseGeocode` calls. Nothing outside that file knows the provider's name.

Keep `normaliseState`. Every geocoder disagrees about Indian state names —
Odisha still comes back as "Orissa", Puducherry as "Pondicherry", Delhi with its
full constitutional title. The state field is a `<select>` whose options are
exactly `INDIAN_STATES`, so a near-miss selects **nothing** and the dropdown
silently stays empty. That table is not Google-specific; it is India-specific.
