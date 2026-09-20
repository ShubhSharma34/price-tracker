# Price Tracker — INE Software Engineer Intern Assignment

A full-stack web application that tracks product prices from the INE mock store by scraping on a fixed schedule.

**Live site:** https://price-tracker-rho-nine.vercel.app  
**GitHub:** https://github.com/ShubhSharma34/price-tracker

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite → Vercel |
| Backend | Node.js (Express) → Render |
| Database | Supabase (PostgreSQL) |
| Scraping | Playwright (Chromium) |
| Scheduling | cron-job.org (every 2 hours) |

> **Note on database:** Supabase is geo-restricted in some regions. If unavailable, Neon (neon.com) is a drop-in replacement — same PostgreSQL schema, just update `DATABASE_URL` in `.env`.

---

## Features

- Search and track products from `demo.inelabteamdev.com`
- Automatic price and stock scraping every 2 hours via external cron
- Price history chart per product
- Per-product scrape log showing every attempt (success, retried, failed) with duration and error
- Dashboard across all tracked products with summary stats, price change indicators, and global scrape log
- Dark/Light mode toggle
- Manual "Scrape Now" button for immediate testing

---

## Local Setup

### Prerequisites
- Node.js 18+
- A Supabase project (or Neon as alternative)

### 1. Clone the repo
```bash
git clone https://github.com/ShubhSharma34/price-tracker.git
cd price-tracker
```

### 2. Backend setup
```bash
cd backend
npm install
npx playwright install chromium
cp .env.example .env
```

Fill in `backend/.env`:
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
CRON_SECRET=your-random-secret
FRONTEND_URL=http://localhost:5173
PORT=4000
```

### 3. Create database tables
Go to Supabase → SQL Editor and run:
```sql
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS price_history (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  price NUMERIC(10,2),
  stock TEXT,
  scraped_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scrape_log (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  error_msg TEXT,
  retries INTEGER DEFAULT 0,
  duration_ms INTEGER,
  scraped_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 4. Frontend setup
```bash
cd ../frontend
npm install
cp .env.example .env
```

Leave `VITE_API_URL` blank for local dev (Vite proxy handles it):
```
VITE_API_URL=
```

### 5. Run locally
```bash
# Terminal 1 — backend
cd backend && node index.js

# Terminal 2 — frontend
cd frontend && npm run dev
```

Open http://localhost:5173

---

## Observable Headed Run

To run the scraper in headed mode (visible browser) for screen recording:

```bash
cd backend
node headed-run.js
```

This opens a real Chrome window and scrapes all tracked products. You can watch the mouse move to the price block, the Reveal Price button being clicked, and the price loading. The terminal simultaneously logs every step including retries and failures.

---

## Scraping Schedule

- Runs every **2 hours** via cron-job.org external HTTP trigger
- Each run scrapes all tracked products sequentially
- A separate keep-warm cron hits `/health` every 14 minutes to prevent Render free tier from sleeping

---

## Deployment

### Backend (Render)
1. New Web Service → connect GitHub repo
2. Root directory: `backend`
3. Build command: `npm install && node node_modules/playwright/cli.js install chromium`
4. Start command: `PLAYWRIGHT_BROWSERS_PATH=0 node index.js`
5. Environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
   - `CRON_SECRET`
   - `FRONTEND_URL`
   - `RENDER=true`
   - `PLAYWRIGHT_BROWSERS_PATH=0`

### Frontend (Vercel)
1. New Project → import repo
2. Root directory: `frontend`
3. Environment variable: `VITE_API_URL=https://your-render-url.onrender.com`

### Cron (cron-job.org)
See setup instructions below.

---

## Environment Variables

| Variable | Where | Description |
|---|---|---|
| `SUPABASE_URL` | backend | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | backend | Supabase service role key |
| `CRON_SECRET` | backend | Protects `/api/scrape` endpoint |
| `FRONTEND_URL` | backend | Vercel URL for CORS |
| `RENDER` | backend | Set to `true` on Render server |
| `PLAYWRIGHT_BROWSERS_PATH` | backend | Set to `0` on Render |
| `VITE_API_URL` | frontend | Render backend URL |
