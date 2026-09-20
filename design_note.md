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

## What AI tools got wrong on the first attempt and how I corrected it

**Wrong store assumption**
The AI assumed WooCommerce markup and wrote selectors for `.woocommerce-Price-amount bdi`. The store is a custom React app — every selector returned null. Fixed by running a debug script that printed actual HTML.

**Cheerio instead of Playwright**
The AI tried Cheerio (static HTML parser) first. The store loads prices via JavaScript after a user interaction, so Cheerio always saw "Price hidden". Fixed by switching entirely to Playwright.

**Wrong price extraction**
After getting Playwright working, prices like ₹25,852 were returning wrong values. The AI was joining all child `<span>` tags inside the price element — but the store renders the price as a single text node with fullwidth Unicode digits (２５,８５２), not split spans. Fixed by reading the hidden `data-price` span's `textContent` directly and adding fullwidth-to-ASCII normalization as fallback.

**Off-screen window trick failed**
To hide the Chrome window locally, the AI tried `--window-position=-32000,-32000`. This silently broke hover because the OS does not deliver mouse events to off-screen windows. Fixed by keeping the window on-screen and using CDP to minimize it between interactions.

your-project/
├── backend/
│   ├── index.js              ← server entry point
│   ├── package.json          ← dependencies
│   ├── .env.example          ← copy to .env and fill values
│   ├── lib/
│   │   ├── db.js             ← Neon DB connection + table setup
│   │   └── scraper.js        ← scraping logic (Cheerio + Playwright)
│   └── routes/
│       ├── products.js       ← CRUD API for products
│       └── scrape.js         ← scrape trigger + logs API
│
└── frontend/
    ├── index.html            ← Vite entry HTML
    ├── package.json          ← dependencies
    ├── vite.config.js        ← Vite config with dev proxy
    ├── .env.example          ← copy to .env and fill values
    └── src/
        ├── main.jsx          ← React root
        ├── App.jsx           ← router setup
        ├── api.js            ← all backend calls
        ├── index.css         ← all styles
        └── pages/
            ├── Search.jsx    ← add product page
            ├── Dashboard.jsx ← the bonus dashboard
            └── Product.jsx   ← single product + chart

**Cookie overlay blocking server clicks**
On the server, the cookie consent overlay was intercepting all pointer events even after our dismissal attempt. Fixed by pre-setting cookie consent cookies in the browser context before page load, plus removing the overlay DOM element directly via `page.evaluate()`.

