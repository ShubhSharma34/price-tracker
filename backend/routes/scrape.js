const express = require('express')
const router = express.Router()
const { supabase } = require('../lib/db')
const { scrapeProduct } = require('../lib/scraper')

// POST /api/scrape — called by cron-job.org
router.post('/', async (req, res) => {
  if (req.headers['x-cron-secret'] !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { data: products } = await supabase.from('products').select('*')
  res.json({ message: `Scraping ${products.length} products`, started: true })
  scrapeAll(products)
})

// POST /api/scrape/:id — manual trigger from UI
router.post('/:id', async (req, res) => {
  const { data: product } = await supabase
    .from('products')
    .select('*')
    .eq('id', req.params.id)
    .single()

  if (!product) return res.status(404).json({ error: 'Not found' })

  res.json({ message: 'Scraping started' })
  await scrapeOne(product)
})

// GET /api/scrape/logs — all recent logs for dashboard
router.get('/logs', async (req, res) => {
  const { data, error } = await supabase
    .from('scrape_log')
    .select('*, products(name)')
    .order('scraped_at', { ascending: false })
    .limit(100)

  if (error) return res.status(500).json({ error: error.message })

  // Flatten product name for frontend
  const flat = data.map(l => ({
    ...l,
    product_name: l.products?.name,
    products: undefined,
  }))

  res.json(flat)
})

async function scrapeAll(products) {
  for (const product of products) {
    await scrapeOne(product)
    await new Promise(r => setTimeout(r, 500))
  }
}

async function scrapeOne(product) {
  console.log(`→ Scraping: ${product.name}`)
  const result = await scrapeProduct(product.url)

  if (result.success) {
    await supabase.from('price_history').insert({
      product_id: product.id,
      price: result.price,
      stock: result.stock,
    })
  }

  const status = result.success
    ? (result.retries > 0 ? 'retried' : 'success')
    : 'failed'

  await supabase.from('scrape_log').insert({
    product_id:  product.id,
    status,
    error_msg:   result.error || null,
    retries:     result.retries,
    duration_ms: result.duration_ms,
  })

  console.log(`  ${result.success ? '✅' : '❌'} ${status} (${result.duration_ms}ms)`)
}

module.exports = router