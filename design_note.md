# Design Note — Price Tracker

## How I made scraping reliable

The INE mock store is deliberately difficult to scrape:
- Prices are hidden behind a hover interaction — page loads with "Price hidden" and a disabled button
- After hovering, the Reveal Price button enables and prices load asynchronously via JavaScript
- Price digits are rendered as fullwidth Unicode characters (２５,８５２) instead of standard ASCII (25,852)
- A hidden `data-price` span contains the clean ASCII price as an accessibility element
- A cookie consent popup appears on first visit and blocks all interactions if not dismissed
- Responses are intentionally slow and occasionally fail entirely

To handle all of this I used Playwright (headless browser) with this strategy:

1. **Cookie consent pre-acceptance** — set `cookie_consent=accepted` cookie before page load so the popup never appears, plus JS-based dismissal as backup

2. **Hover simulation** — on local/headed mode, move the mouse in 30 small steps toward the price block center which triggers the CSS hover state and enables the Reveal Price button. On server/headless mode, dispatch raw pointer and mouse events directly to the element

3. **JS button click** — use `page.evaluate()` to force-enable and click the button, bypassing Playwright's overlay detection entirely

4. **Up to 5 reveal attempts per session** — if price block stays idle, retry the hover and click sequence

5. **Price extraction** — read the hidden `data-price` span using `textContent` (not `innerText` which ignores hidden elements) for clean ASCII digits. Fall back to finding the `font-weight:700` element and converting fullwidth Unicode digits to ASCII

6. **3 outer retries** with exponential backoff on top of 5 inner attempts

7. **Honest logging** — every attempt is recorded in `scrape_log` including failures, retry count, duration, and error message. Nothing is silently swallowed

## Trade-offs made

**Headed vs headless browser**
The store's React component checks for genuine CSS hover state to enable the reveal button. Headless Playwright does not fire CSS hover reliably. Running headed (visible browser) makes hover work correctly on local machines. On the production server (Render/Linux) there is no display, so headless mode is used automatically via `process.env.RENDER === 'true'` — the scraper falls back to JS event dispatching which works partially.

**Speed vs reliability**
Each scrape takes 20-60 seconds per product because of mouse movement simulation, wait times, and retry delays. A faster scraper misses prices more often. Since scrapes run every 2 hours unattended, reliability matters more than speed.

**External cron vs always-on loop**
Free tier Render instances sleep after inactivity. An always-on `setTimeout` loop gets killed when the instance sleeps. Using cron-job.org as an external HTTP trigger means the cron fires regardless, and the HTTP request itself wakes the instance.

**Neon vs Supabase**
Supabase is geo-restricted in some regions. Switched to Neon (pure PostgreSQL, permanent free tier, Singapore region) — same schema and SQL queries, just a different connection string.

