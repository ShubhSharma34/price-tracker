/**
 * debug.js — test scraper on a product and show exactly what happens
 * Run: node debug.js
 */
require('dotenv').config()
const { scrapeProduct } = require('./lib/scraper')

const TEST_URLS = [
  'https://demo.inelabteamdev.com/product/163',
  'https://demo.inelabteamdev.com/product/219',
]

async function main() {
  for (const url of TEST_URLS) {
    console.log(`\n${'='.repeat(60)}`)
    console.log(`Testing: ${url}`)
    console.log('='.repeat(60))
    
    const result = await scrapeProduct(url)
    console.log('\nFinal result:', JSON.stringify(result, null, 2))
  }
}

main().catch(console.error)