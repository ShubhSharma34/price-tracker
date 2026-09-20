# Design Note — Scraping Reliability & Trade-offs

## How I made scraping reliable

The INE mock store is deliberately awkward in several ways:
- Prices are hidden behind a hover interaction — the page loads with
  "Price hidden" and a disabled button
- After hovering, prices load asynchronously via JavaScript
- Price digits are rendered as fullwidth Unicode characters (２５,８５２)
  instead of standard ASCII digits (25,852) to confuse scrapers
- The store also inserts a hidden `data-price` span with clean ASCII
  digits as an accessibility element
- Responses are intentionally slow and occasionally fail
- A cookie consent popup appears on first visit and blocks interaction

To handle all of this I used Playwright (headless browser) with a
multi-layer strategy:

1. **Cookie popup dismissal** — before touching the price block,
   detect and click Accept so it never blocks the reveal button

2. **Hover simulation** — move the mouse in 30 small steps toward the
   price block center, which triggers the CSS hover state and enables
   the reveal button

3. **Up to 5 hover attempts per session** — if the button stays
   disabled, move the mouse away and try again. Between attempts,
   scroll the page slightly to reset hover state

4. **Price extraction** — read the hidden `data-price` span using
   `textContent` (not `innerText`, which ignores hidden elements).
   This gives clean ASCII digits directly

5. **Fullwidth digit normalization** — convert Unicode fullwidth digits
   (０-９, U+FF10–FF19) to ASCII before parsing, as fallback when
   data-price is unavailable

6. **3 outer retries** with exponential backoff on top of the 5 inner
   hover attempts — so worst case the scraper makes 15 total attempts
   before marking a run as failed

7. **Honest logging** — every attempt is recorded in scrape_log
   including failures, retry count, duration, and error message.
   Nothing is hidden or silently swallowed

## Trade-offs made

**Headed vs headless browser**
Headless Playwright does not fire CSS :hover events reliably on this
store. The store detects headless mode and keeps the button disabled.
Running headed (visible browser) makes hover work correctly. On the
production server (Render/Linux) the RENDER environment variable
switches to headless automatically since there is no display — and the
hover workaround (force-clicking after JS disables check) compensates.

**Speed vs reliability**
Each scrape takes 20-45 seconds per product because of the slow mouse
movement, wait times, and retry delays. A faster scraper would miss
prices more often. Since scrapes run every 2 hours unattended, speed
is less important than correctness.

**External cron vs always-on loop**
Free tier Render instances sleep after inactivity. An always-on
setTimeout loop would be killed when the instance sleeps. Using
cron-job.org as an external HTTP trigger means the cron fires
regardless of whether the backend was sleeping, and the HTTP request
itself wakes the instance up.

## What AI tools got wrong on the first attempt

**Attempt 1 — Wrong assumption about store structure**
The AI assumed the store used WooCommerce markup and wrote selectors
for `.woocommerce-Price-amount bdi`. The store is a completely custom
React app. Every selector returned null. Fixed by running a debug
script that printed the actual HTML.

**Attempt 2 — Cheerio instead of Playwright**
The AI tried Cheerio (static HTML parser) first. The store loads
prices via JavaScript after a user interaction, so Cheerio always
saw "Price hidden". Fixed by switching entirely to Playwright.

**Attempt 3 — Wrong price extraction**
After getting Playwright working, prices like ₹25,852 were coming
through as wrong values (e.g. 20,032). The AI was joining all child
spans inside the price element — but the store renders the price as
a single text node with fullwidth Unicode digits (２５,８５２), not
split spans. The span-joining logic was reading partial/wrong content.
Fixed by reading the hidden `data-price` span's textContent directly,
and adding fullwidth-to-ASCII normalization as fallback.

**Attempt 4 — Off-screen window trick failed**
To hide the Chrome window from the user, the AI tried
`--window-position=-32000,-32000`. This silently broke hover because
the OS does not deliver mouse events to off-screen windows. Fixed by
keeping the window on-screen but using CDP to minimize it, then
restore briefly for the hover interaction.