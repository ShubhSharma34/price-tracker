const express = require('express')
const router = express.Router()
const { supabase } = require('../lib/db')

// GET /api/products — all products with latest price
router.get('/', async (req, res) => {
  try {
    // Get all products
    const { data: products, error } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error

    // For each product, get its latest and second-latest price
    const enriched = await Promise.all(products.map(async (p) => {
      const { data: history } = await supabase
        .from('price_history')
        .select('price, stock, scraped_at')
        .eq('product_id', p.id)
        .order('scraped_at', { ascending: false })
        .limit(2)

      return {
        ...p,
        current_price: history?.[0]?.price ?? null,
        current_stock: history?.[0]?.stock ?? null,
        last_scraped:  history?.[0]?.scraped_at ?? null,
        prev_price:    history?.[1]?.price ?? null,
      }
    }))

    res.json(enriched)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/products
router.post('/', async (req, res) => {
  const { name, url } = req.body
  if (!name || !url) return res.status(400).json({ error: 'name and url required' })

  const { data, error } = await supabase
    .from('products')
    .upsert({ name: name.trim(), url: url.trim() }, { onConflict: 'url' })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

// DELETE /api/products/:id
router.delete('/:id', async (req, res) => {
  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', req.params.id)

  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true })
})

// GET /api/products/:id/history
router.get('/:id/history', async (req, res) => {
  const { data, error } = await supabase
    .from('price_history')
    .select('price, stock, scraped_at')
    .eq('product_id', req.params.id)
    .order('scraped_at', { ascending: true })

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// GET /api/products/:id/logs
router.get('/:id/logs', async (req, res) => {
  const { data, error } = await supabase
    .from('scrape_log')
    .select('status, error_msg, retries, duration_ms, scraped_at')
    .eq('product_id', req.params.id)
    .order('scraped_at', { ascending: false })
    .limit(50)

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

module.exports = router