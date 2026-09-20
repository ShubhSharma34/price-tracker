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

async function dismissCookies(page) {
  // Method 1: Click via JavaScript — works even in headless
  const dismissed = await page.evaluate(() => {
    // Find any Accept/cookie button
    const buttons = Array.from(document.querySelectorAll('button'))
    const acceptBtn = buttons.find(b => {
      const txt = b.innerText?.toLowerCase() || ''
      return txt.includes('accept') || txt.includes('agree') || txt.includes('ok')
    })
    if (acceptBtn) {
      acceptBtn.click()
      return true
    }

    // Also try removing the overlay directly
    const overlay = document.querySelector('.cookie-overlay, [class*="cookie"], [id*="cookie"]')
    if (overlay) {
      overlay.remove()
      return true
    }
    return false
  })

  if (dismissed) {
    console.log(`    Dismissed cookie via JS`)
    await sleep(1000)
    return
  }

  // Method 2: Playwright locator with force
  try {
    const btn = page.locator('button:has-text("Accept"), button:has-text("ACCEPT"), button:has-text("agree")')
    if (await btn.count() > 0) {
      await btn.first().click({ force: true })
      console.log(`    Dismissed cookie via locator`)
      await sleep(1000)
    }
  } catch { }
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

  // Set cookie consent cookie so popup never appears
  await context.addCookies([{
    name: 'cookie_consent',
    value: 'accepted',
    domain: 'demo.inelabteamdev.com',
    path: '/',
  }, {
    name: 'cookieConsent',
    value: 'true',
    domain: 'demo.inelabteamdev.com',
    path: '/',
  }])

  const page = await context.newPage()

  try {
    console.log(`  → Attempt ${attemptNumber} [${isServer ? 'headless' : 'headed'}]: ${url}`)

    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
    await sleep(1500)

    // Always try to dismiss cookies — belt and suspenders approach
    await dismissCookies(page)

    // Remove cookie overlay if still present
    await page.evaluate(() => {
      const overlays = document.querySelectorAll('.cookie-overlay, [class*="cookie-banner"], [class*="cookie-consent"]')
      overlays.forEach(el => el.remove())

      // Also remove any fixed overlays blocking the page
      const allFixed = Array.from(document.querySelectorAll('*')).filter(el => {
        const style = window.getComputedStyle(el)
        return (style.position === 'fixed' || style.position === 'sticky') &&
               el.className.toString().toLowerCase().includes('cookie')
      })
      allFixed.forEach(el => el.remove())
    })
    await sleep(500)

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
        // SERVER: trigger React hover events + remove overlay again just in case
        await page.evaluate(() => {
          // Remove any overlays blocking clicks
          document.querySelectorAll('.cookie-overlay, [class*="overlay"]').forEach(el => {
            const txt = el.innerText?.toLowerCase() || ''
            if (txt.includes('cookie') || txt.includes('consent')) el.remove()
          })

          const block = document.querySelector('.price-block')
          if (!block) return

          const rect = block.getBoundingClientRect()
          const x = rect.left + rect.width / 2
          const y = rect.top + rect.height / 2
          const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window }

          block.dispatchEvent(new MouseEvent('mouseover', opts))
          block.dispatchEvent(new MouseEvent('mouseenter', { ...opts, bubbles: false }))
          block.dispatchEvent(new PointerEvent('pointerover', opts))
          block.dispatchEvent(new PointerEvent('pointerenter', { ...opts, bubbles: false }))
          block.dispatchEvent(new MouseEvent('mousemove', opts))
        })
        await sleep(2000)
      }

      // Always use JS click — bypasses Playwright's overlay detection
      await page.evaluate(() => {
        const btn = document.querySelector('.price-block button')
        if (btn) {
          btn.disabled = false
          btn.removeAttribute('disabled')
          btn.click()
        }
      })
      console.log(`      Clicked button via JS`)

      // Wait for price block to leave idle state
      try {
        await page.waitForFunction(() => {
          const b = document.querySelector('.price-block')
          return b && !b.classList.contains('price-idle')
        }, { timeout: 10000 })
        console.log(`      Price revealed ✓`)
      } catch {
        console.log(`      Still idle — extracting anyway`)
      }

      await sleep(2000)

      // Extract price
      const result = await page.evaluate(() => {
        const block = document.querySelector('.price-block')
        if (!block) return { priceText: null, stockText: 'unknown' }

        let priceText = null

        // Primary: data-price hidden span
        const dp = block.querySelector('[data-price="true"]')
        if (dp) {
          const t = dp.textContent.trim()
          if (t && t.includes('₹')) priceText = t
        }

        // Fallback: font-weight:700 element
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

      console.log(`      Extracted: "${result.priceText}", stock: "${result.stockText}"`)

      if (result.priceText) {
        priceText = result.priceText
        stockText = result.stockText
        break
      }

      // Click refresh if visible
      try {
        await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'))
          const refresh = buttons.find(b => b.innerText?.toLowerCase().includes('refresh'))
          if (refresh) refresh.click()
        })
        await sleep(3000)
      } catch { }
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