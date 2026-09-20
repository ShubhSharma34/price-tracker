require('dotenv').config()
const express = require('express')
const cors = require('cors')
const { initDB } = require('./lib/db')

const app = express()

app.use(cors({
  origin: process.env.FRONTEND_URL || '*', // set to your Vercel URL in prod
}))
app.use(express.json())

// Routes
app.use('/api/products', require('./routes/products'))
app.use('/api/scrape', require('./routes/scrape'))

// Health check — cron-job.org can ping this to keep Render awake
app.get('/health', (_, res) => res.json({ ok: true, time: new Date().toISOString() }))

const PORT = process.env.PORT || 4000

async function start() {
  await initDB()
  app.listen(PORT, () => console.log(`🚀 Backend running on port ${PORT}`))
}

start().catch(err => {
  console.error('Failed to start:', err)
  process.exit(1)
})
