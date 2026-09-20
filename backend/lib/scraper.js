const { chromium } = require('playwright')

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

function parsePrice(raw) {
  if (!raw) return null
  const normalized = String(raw).replace(/[０-９]/g, c =>
    String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 48)
  )
  const digits = normalized.replace(/[^0-9]/g, '')
  const num = parseFloat(digits)
  return isNaN(num) ? null : num
}

async function extractPrice(page) {
  return await page.evaluate(() => {
    const block = document.querySelector('.price-block')
    if (!block) return { priceText: null, stockText: 'unknown' }

    let priceText = null

    // Primary: data-price hidden span (clean ASCII digits)
    const dp = block.querySelector('[data-price="true"]')
    if (dp) {
      const t = dp.textContent.trim()
      if (t && t.includes('₹')) priceText = t
    }

    // Fallback: bold element font-weight:700
    if (!priceText) {
      for (const el of block.querySelectorAll('*')) {
        const style = el.getAttribute('style') || ''
        if (style.includes('font-weight: 700') || style.includes('font-weight:700')) {
          const t = el.textContent.trim()
          if (t && t.includes('₹') && /[\d０-９]/.test(t)) { priceText = t; break }
        }
      }
    }

    // Fallback: pv-* class
    if (!priceText) {
      for (const el of block.querySelectorAll('*')) {
        if (Array.from(el.classList).some(c => /^pv-/.test(c))) {
          const t = el.textContent.trim()
          if (t && t.includes('₹') && /[\d０-９]/.test(t)) { priceText = t; break }
        }
      }
    }

    // Fallback: any ₹ number
    if (!priceText) {
      const m = block.textContent.match(/₹[\d０-９,]+/)
      if (m) priceText = m[0]
    }

    // Stock
    let stockText = 'unknown'
    const badge = block.querySelector('.stock-badge')
    if (badge) {
      const cls = badge.className
      const txt = badge.innerText?.toLowerCase() || ''
      if (cls.includes('out-of-stock') || txt.includes('out of stock')) stockText = 'out_of_stock'
      else if (cls.includes('in-stock') || /\d+ in stock/.test(txt)) stockText = 'in_stock'
    }
    if (stockText === 'unknown') {
      const full = document.body.innerText?.toLowerCase() || ''
      if (full.includes('out of stock')) stockText = 'out_of_stock'
      else if (full.includes('in stock')) stockText = 'in_stock'
    }

    return { priceText, stockText, blockClass: block.className }
  })
}

async function triggerPriceReveal(page) {
  // Method 1: Find React fiber on the price block and call its event handlers
  const reactTriggered = await page.evaluate(() => {
    const block = document.querySelector('.price-block')
    if (!block) return false

    // Find React internal fiber key
    const fiberKey = Object.keys(block).find(k =>
      k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance')
    )

    if (fiberKey) {
      let fiber = block[fiberKey]
      // Walk up fiber tree to find onMouseEnter/onPointerEnter handlers
      while (fiber) {
        const props = fiber.memoizedProps || fiber.pendingProps
        if (props) {
          const handler = props.onMouseEnter || props.onPointerEnter || props.onMouseOver
          if (handler) {
            try {
              handler({ type: 'mouseenter', bubbles: true })
              return true
            } catch(e) {}
          }
        }
        fiber = fiber.return
      }
    }
    return false
  })

  if (reactTriggered) {
    console.log(`      React handler triggered`)
    await sleep(2000)
    return
  }

  // Method 2: Dispatch events on every parent element up to body
  await page.evaluate(() => {
    const block = document.querySelector('.price-block')
    if (!block) return

    const rect = block.getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2

    const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window }

    // Fire on block and all parents
    let el = block
    while (el && el !== document.body) {
      el.dispatchEvent(new MouseEvent('mouseover', opts))
      el.dispatchEvent(new MouseEvent('mouseenter', { ...opts, bubbles: false }))
      el.dispatchEvent(new PointerEvent('pointerover', opts))
      el.dispatchEvent(new PointerEvent('pointerenter', { ...opts, bubbles: false }))
      el = el.parentElement
    }
  })

  await sleep(2000)
}

async function scrapeWithPlaywright(url, attemptNumber) {
  const isServer = process.env.RENDER === 'true'

  const browser = await chromium.launch({
    headless: isServer,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1280,800',
      ...(isServer ? ['--disable-dev-shm-usage', '--disable-gpu'] : []),
    ],
  })

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  })

  const page = await context.newPage()

  try {
    console.log(`  → Attempt ${attemptNumber} [${isServer ? 'headless' : 'headed'}]: ${url}`)

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

    let priceText = null
    let stockText = 'unknown'

    for (let attempt = 1; attempt <= 5; attempt++) {
      console.log(`    Reveal attempt ${attempt}/5`)

      if (!isServer) {
        // LOCAL: slow mouse move
        const box = await page.locator('.price-block').boundingBox()
        if (box) {
          const cx = box.x + box.width / 2
          const cy = box.y + box.height / 2
          await page.mouse.move(0, 0)
          await sleep(200)
          for (let i = 1; i <= 30; i++) {
            await page.mouse.move((cx / 30) * i, (cy / 30) * i)
            await sleep(35)
          }
          await sleep(1500)
        }
      } else {
        // SERVER: React fiber trigger + event dispatch
        await triggerPriceReveal(page)
      }

      // Check button state
      const btnEnabled = await page.evaluate(() => {
        const btn = document.querySelector('.price-block button')
        return btn ? !btn.disabled : false
      })
      console.log(`      Button enabled: ${btnEnabled}`)

     // Always use evaluate click — avoids Playwright's "enabled" check entirely
await page.evaluate(() => {
  const btn = document.querySelector('.price-block button')
  if (btn) {
    btn.disabled = false
    btn.removeAttribute('disabled')
    btn.click()
  }
})
console.log(`      Clicked button via JS (enabled: ${btnEnabled})`)
      // Wait for price block to leave idle state
      try {
        await page.waitForFunction(() => {
          const b = document.querySelector('.price-block')
          return b && !b.classList.contains('price-idle')
        }, { timeout: 10000 })
        console.log(`      Price revealed ✓`)
      } catch {
        console.log(`      Still idle — will extract anyway`)
      }

      await sleep(2000)

      const result = await extractPrice(page)
      console.log(`      Extracted: "${result.priceText}", stock: "${result.stockText}", block: "${result.blockClass}"`)

      if (result.priceText) {
        priceText = result.priceText
        stockText = result.stockText
        break
      }

      // Click refresh if visible
      try {
        const refreshBtn = page.locator('button:has-text("Refresh")')
        if (await refreshBtn.count() > 0) {
          await refreshBtn.first().click()
          console.log(`      Clicked refresh button`)
          await sleep(3000)
        }
      } catch { }

      // Small wait before next attempt
      await sleep(1000)
    }

    console.log(`    Final: "${priceText}" → ${parsePrice(priceText)}, stock: ${stockText}`)

    if (!priceText) throw new Error('Price not found after all attempts')

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