/**
 * headed-run.js
 * Runs the scraper in HEADED mode (visible browser window)
 * Use this to record a screen recording for the assignment deliverable.
 *
 * Usage:
 *   node headed-run.js
 *
 * This will open a real browser window and scrape all tracked products
 * so you can screen-record it showing how it handles slow/failing responses.
 */

require('dotenv').config()
const { scrapeProduct } = require('./lib/scraper')
const { supabase } = require('./lib/db')

async function headedRun() {
  console.log('🎬 Starting HEADED scrape run (screen record this!)\n')

  const { data: products } = await supabase.from('products').select('*')

  if (!products?.length) {
    console.log('No products tracked yet. Add some via the frontend first.')
    return
  }

  console.log(`Found ${products.length} products to scrape:\n`)
  products.forEach(p => console.log(`  - ${p.name}: ${p.url}`))
  console.log('\n--- Starting scrape ---\n')

  for (const product of products) {
    console.log(`\n📦 Scraping: ${product.name}`)
    const result = await scrapeProduct(product.url)

    if (result.success) {
      console.log(`  ✅ Price: ₹${result.price?.toLocaleString('en-IN')}`)
      console.log(`  📊 Stock: ${result.stock}`)
      console.log(`  ⏱  Duration: ${result.duration_ms}ms`)
      console.log(`  🔄 Retries: ${result.retries}`)
    } else {
      console.log(`  ❌ Failed: ${result.error}`)
      console.log(`  ⏱  Duration: ${result.duration_ms}ms`)
      console.log(`  🔄 Retries: ${result.retries}`)
    }
  }

  console.log('\n--- Headed run complete ---')
}

headedRun().catch(console.error)