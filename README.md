# Product Price Tracker — INE Assignment

## Stack
- **Frontend**: React + Vite → deployed on Vercel
- **Backend**: Node.js (Express) → deployed on Render
- **Database**: Neon (PostgreSQL) — used instead of Supabase due to regional access restrictions; same SQL schema
- **Scraping**: Axios + Cheerio (lightweight), Playwright fallback (for JS-rendered content)
- **Scheduling**: cron-job.org → calls `/api/scrape` every 2 hours

---

## Local Development

### 1. Clone & install

```bash
git clone <your-repo>

# Backend
cd backend
npm install
cp .env.example .env    # fill in your DATABASE_URL and CRON_SECRET

# Frontend
cd ../frontend
npm install
cp .env.example .env    # fill in VITE_API_URL (leave blank for local dev)
```

### 2. Set up Neon database

1. Go to [neon.com](https://neon.com) → sign up free
2. Create a project → pick **Singapore** region (lowest latency from India)
3. Copy the **Connection string** → paste as `DATABASE_URL` in `backend/.env`
4. Tables are created automatically on first backend start

### 3. Run locally

```bash
# Terminal 1 — backend
cd backend && npm run dev
# Starts on http://localhost:4000

# Terminal 2 — frontend
cd frontend && npm run dev
# Starts on http://localhost:5173
```

---

## Deployment

### Backend → Render

1. Push code to GitHub
2. Go to [render.com](https://render.com) → New → Web Service → connect your repo
3. Set **Root directory**: `backend`
4. **Build command**: `npm install`
5. **Start command**: `node index.js`
6. Add environment variables:
   - `DATABASE_URL` = your Neon connection string
   - `CRON_SECRET` = any random secret string
   - `FRONTEND_URL` = your Vercel URL (add after step below)
7. Deploy → copy the Render URL (e.g. `https://price-tracker-api.onrender.com`)

### Frontend → Vercel

1. Go to [vercel.com](https://vercel.com) → New Project → import repo
2. Set **Root directory**: `frontend`
3. Add environment variable:
   - `VITE_API_URL` = your Render backend URL
4. Deploy → copy the Vercel URL → paste into Render's `FRONTEND_URL` env var → redeploy Render

### Cron → cron-job.org

1. Go to [cron-job.org](https://cron-job.org) → sign up free
2. Create a new cronjob:
   - **URL**: `https://your-render-url.onrender.com/api/scrape`
   - **Method**: POST
   - **Header**: `x-cron-secret: <your CRON_SECRET value>`
   - **Schedule**: every 2 hours
3. Also add a second "keep warm" job:
   - **URL**: `https://your-render-url.onrender.com/health`
   - **Method**: GET
   - **Schedule**: every 14 minutes (prevents Render free tier from sleeping)

---

## Scraping Schedule

- Runs every **2 hours** via cron-job.org external trigger
- Each run scrapes all tracked products sequentially
- Free-tier Render instances sleep — the keep-warm cron prevents this

## Environment Variables

| Variable | Where | Description |
|---|---|---|
| `DATABASE_URL` | backend | Neon PostgreSQL connection string |
| `CRON_SECRET` | backend | Protects the `/api/scrape` endpoint |
| `FRONTEND_URL` | backend | Your Vercel URL (for CORS) |
| `VITE_API_URL` | frontend | Your Render backend URL |

---

## Design Decisions

### Why Cheerio first, Playwright fallback?
The assignment explicitly prefers lightweight HTTP fetching over a headless browser. Cheerio is ~100× faster and uses far less memory. We only launch Playwright when the price element doesn't appear in the raw HTML (usually because it's rendered by JavaScript).

### Why honest failure logging?
Every scrape attempt — including failures and retries — is written to `scrape_log`. Failures are never hidden. The dashboard shows the real success rate. This matches what the assignment explicitly requires.

### Why Neon instead of Supabase?
Supabase is geo-restricted in India. Neon is pure PostgreSQL with a permanent free tier, accessible from India, with a Singapore region for low latency. The schema, SQL queries, and `pg` driver are identical to what Supabase would use.

### What my AI tools got wrong on the first attempt
The initial scraper used a single CSS selector (`.price`) which works on standard WooCommerce but missed the `bdi` wrapper inside sale-price markup. Also the first retry logic retried on *all* errors including "price not found" — which wastes time retrying a structural issue that Playwright, not more retries, should solve. Fixed by splitting error types: network errors → retry with Cheerio; "not found" → fall through to Playwright immediately.
