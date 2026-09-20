const { chromium } = require('playwright')

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

function parsePrice(raw) {
  if (!raw) return null
  const digits = String(raw).replace(/[^0-9]/g, '')
  const num = parseFloat(digits)
  return isNaN(num) ? null : num
}

async function scrapeWithPlaywright(url, attemptNumber) {
  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,800'],
  })

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  })

  const page = await context.newPage()

  try {
    console.log(`  → Attempt ${attemptNumber}: ${url}`)

    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
    await sleep(2000)

    // Dismiss cookie popup
    try {
      const acceptBtn = page.locator('button:has-text("Accept"), button:has-text("ACCEPT")')
      if (await acceptBtn.count() > 0) {
        await acceptBtn.first().click()
        console.log(`    Dismissed cookie popup`)
        await sleep(1000)
      }
    } catch { }

    await page.waitForSelector('.price-block', { timeout: 10000 })

    // Try up to 5 hover+click attempts within one browser session
    let priceText = null
    let stockText = 'unknown'

    for (let hover = 1; hover <= 5; hover++) {
      console.log(`    Hover attempt ${hover}/5`)

      const box = await page.locator('.price-block').boundingBox()
      if (!box) break

      const centerX = box.x + box.width / 2
      const centerY = box.y + box.height / 2

      // Move mouse away first, then slowly back
      await page.mouse.move(0, 0)
      await sleep(300)

      // Slow move in 30 steps
      for (let i = 1; i <= 30; i++) {
        await page.mouse.move((centerX / 30) * i, (centerY / 30) * i)
        await sleep(40)
      }
      await sleep(1500)

      const btnEnabled = await page.evaluate(() => {
        const btn = document.querySelector('.price-block button')
        return btn ? !btn.disabled : false
      })
      console.log(`      Button enabled: ${btnEnabled}`)

      if (btnEnabled) {
        await page.click('.price-block button')
      } else {
        // Try clicking via JS as backup
        await page.evaluate(() => {
          const btn = document.querySelector('.price-block button')
          if (btn) btn.click()
        })
      }

      // Wait for price to appear
      try {
        await page.waitForFunction(() => {
          const block = document.querySelector('.price-block')
          return block && !block.classList.contains('price-idle')
        }, { timeout: 8000 })
        console.log(`      Price loaded ✓`)
      } catch {
        console.log(`      Still idle — retrying hover`)
        // Scroll page slightly and try again (sometimes resets hover state)
        await page.evaluate(() => window.scrollBy(0, 10))
        await sleep(500)
        await page.evaluate(() => window.scrollBy(0, -10))
        await sleep(500)
        continue
      }

      await sleep(2000)

      // Extract price
      const result = await page.evaluate(() => {
        const block = document.querySelector('.price-block')
        if (!block) return { priceText: null, stockText: 'unknown' }

        let priceText = null

        // Bold price element (font-weight: 700)
        for (const el of block.querySelectorAll('*')) {
          const style = el.getAttribute('style') || ''
          if (style.includes('font-weight: 700') || style.includes('font-weight:700')) {
            let joined = ''
            el.querySelectorAll('span').forEach(s => { joined += s.innerText })
            joined = joined.trim()
            if (joined.includes('₹') && /\d/.test(joined)) {
              priceText = joined
              break
            }
          }
        }

        // pv-* class fallback
        if (!priceText) {
          for (const el of block.querySelectorAll('*')) {
            const hasPv = Array.from(el.classList).some(c => /^pv-/.test(c))
            if (hasPv) {
              let joined = ''
              el.querySelectorAll('span').forEach(s => { joined += s.innerText })
              joined = joined.trim()
              if (joined.includes('₹') && /\d/.test(joined)) {
                priceText = joined
                break
              }
            }
          }
        }

        // data-price fallback
        if (!priceText) {
          const dp = block.querySelector('[data-price="true"]')
          if (dp && dp.innerText.includes('₹')) priceText = dp.innerText.trim()
        }

        // Regex fallback
        if (!priceText) {
          const m = block.innerText.match(/₹[\d,]+/)
          if (m) priceText = m[0]
        }

        // Stock
        let stockText = 'unknown'
        const badge = block.querySelector('.stock-badge')
        if (badge) {
          const cls = badge.className
          const txt = badge.innerText.toLowerCase()
          if (cls.includes('out-of-stock') || txt.includes('out of stock')) stockText = 'out_of_stock'
          else if (cls.includes('in-stock') || /\d+ in stock/.test(txt) || txt.includes('in stock')) stockText = 'in_stock'
        }
        if (stockText === 'unknown') {
          const full = document.body.innerText.toLowerCase()
          if (full.includes('out of stock')) stockText = 'out_of_stock'
          else if (full.includes('in stock')) stockText = 'in_stock'
        }

        return { priceText, stockText }
      })

      if (result.priceText) {
        priceText = result.priceText
        stockText = result.stockText
        console.log(`      Got price: ${priceText}, stock: ${stockText}`)
        break // success — stop hover attempts
      }

      // Price still not found — click Refresh price button if visible and retry
      try {
        const refreshBtn = page.locator('button:has-text("Refresh price"), button:has-text("REFRESH PRICE")')
        if (await refreshBtn.count() > 0) {
          await refreshBtn.first().click()
          console.log(`      Clicked refresh price button`)
          await sleep(3000)
        }
      } catch { }
    }

    console.log(`    Final — Price: "${priceText}", Stock: "${stockText}"`)

    if (!priceText) {
      throw new Error('Price not found after 5 hover attempts')
    }

    return { price: parsePrice(priceText), stock: stockText }

  } finally {
    await browser.close()
  }
}

async function scrapeProduct(url) {
  const start = Date.now()
  let lastError

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await scrapeWithPlaywright(url, attempt)
      return {
        success: true,
        price: result.price,
        stock: result.stock,
        retries: attempt - 1,
        duration_ms: Date.now() - start,
      }
    } catch (err) {
      lastError = err
      if (attempt < 3) {
        const wait = 3000 * attempt
        console.warn(`  ⚠ Attempt ${attempt} failed: ${err.message} — retrying in ${wait}ms`)
        await new Promise(r => setTimeout(r, wait))
      }
    }
  }

  return {
    success: false,
    price: null,
    stock: null,
    retries: 3,
    duration_ms: Date.now() - start,
    error: lastError.message,
  }
}

module.exports = { scrapeProduct }