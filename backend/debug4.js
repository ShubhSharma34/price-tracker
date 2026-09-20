require('dotenv').config()
const { chromium } = require('playwright')

async function debug() {
  const url = 'https://demo.inelabteamdev.com/product/163'
  
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  })
  const page = await context.newPage()

  // Intercept the price API response directly
  let priceData = null
  let layoutData = null

  page.on('response', async res => {
    const u = res.url()
    if (u.includes('/api/products/') && u.includes('/price')) {
      try {
        const json = await res.json()
        console.log('PRICE API response:', JSON.stringify(json, null, 2))
        priceData = json
      } catch(e) { console.log('Price parse error:', e.message) }
    }
    if (u.includes('/api/layout')) {
      try {
        layoutData = await res.json()
        console.log('LAYOUT API response:', JSON.stringify(layoutData, null, 2))
      } catch(e) {}
    }
    if (u.includes('/api/challenge')) {
      try {
        const json = await res.json()
        console.log('CHALLENGE API response:', JSON.stringify(json, null, 2))
      } catch(e) {}
    }
    if (u.includes('/api/session')) {
      try {
        const text = await res.text()
        console.log('SESSION API response:', text)
      } catch(e) {}
    }
  })

  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
  await new Promise(r => setTimeout(r, 2000))
  
  // Trigger price load with slow mouse move
  const box = await page.locator('.price-block').boundingBox()
  const steps = 20
  for (let i = 0; i <= steps; i++) {
    await page.mouse.move(
      (box.x + box.width/2) / steps * i,
      (box.y + box.height/2) / steps * i
    )
    await new Promise(r => setTimeout(r, 30))
  }
  
  await new Promise(r => setTimeout(r, 5000))
  
  // Extract price from the rendered spans
  const extracted = await page.evaluate(() => {
    const block = document.querySelector('.price-block')
    if (!block) return null

    // The price is split into individual digit spans inside pv-k2 class
    const priceSpans = block.querySelectorAll('[class*="pv-k2"] span')
    let priceFromSpans = ''
    priceSpans.forEach(s => priceFromSpans += s.innerText)
    console.log('Price from spans:', priceFromSpans)

    // Also try data-price attribute
    const dataPriceEl = block.querySelector('[data-price="true"]')
    const dataPrice = dataPriceEl ? dataPriceEl.innerText : null

    // Stock
    const stockEl = block.querySelector('.stock-badge')
    const stockText = stockEl ? stockEl.innerText : null
    const stockClass = stockEl ? stockEl.className : null

    return { priceFromSpans, dataPrice, stockText, stockClass }
  })

  console.log('\nExtracted:', JSON.stringify(extracted, null, 2))
  await browser.close()
}

debug().catch(console.error)