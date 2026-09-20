require('dotenv').config()
const { chromium } = require('playwright')

async function debug() {
  const url = 'https://demo.inelabteamdev.com/product/163'
  const browser = await chromium.launch({ headless: false, args: ['--no-sandbox'] })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  })
  const page = await context.newPage()

  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
  await new Promise(r => setTimeout(r, 2000))

  // Dismiss cookie popup
  try {
    const btn = page.locator('button:has-text("Accept")')
    if (await btn.count() > 0) { await btn.first().click(); await new Promise(r => setTimeout(r, 1000)) }
  } catch {}

  // Trigger hover
  const box = await page.locator('.price-block').boundingBox()
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2
  await page.mouse.move(0, 0)
  for (let i = 1; i <= 30; i++) {
    await page.mouse.move((cx/30)*i, (cy/30)*i)
    await new Promise(r => setTimeout(r, 40))
  }
  await new Promise(r => setTimeout(r, 1500))

  const enabled = await page.evaluate(() => !document.querySelector('.price-block button')?.disabled)
  if (enabled) await page.click('.price-block button')
  else await page.click('.price-block button', { force: true })

  await page.waitForFunction(() => {
    const b = document.querySelector('.price-block')
    return b && !b.classList.contains('price-idle')
  }, { timeout: 15000 }).catch(() => {})

  await new Promise(r => setTimeout(r, 2000))

  // Print FULL price block HTML with ALL span details including styles
  const result = await page.evaluate(() => {
    const block = document.querySelector('.price-block')
    
    // Find the bold price element
    let boldEl = null
    for (const el of block.querySelectorAll('*')) {
      const style = el.getAttribute('style') || ''
      if (style.includes('font-weight: 700') || style.includes('font-weight:700')) {
        boldEl = el
        break
      }
    }

    if (!boldEl) return { error: 'No bold element found', html: block.innerHTML }

    // Check EVERY span inside bold element — including hidden ones
    const spans = boldEl.querySelectorAll('span')
    const spanDetails = Array.from(spans).map(s => ({
      text: s.innerText,
      textContent: s.textContent,
      display: window.getComputedStyle(s).display,
      visibility: window.getComputedStyle(s).visibility,
      opacity: window.getComputedStyle(s).opacity,
      ariaHidden: s.getAttribute('aria-hidden'),
      style: s.getAttribute('style'),
      className: s.className,
    }))

    return {
      boldElHTML: boldEl.outerHTML,
      boldElInnerText: boldEl.innerText,
      spanDetails,
      // Also check data-price
      dataPriceEl: block.querySelector('[data-price="true"]')?.innerText,
      dataPriceElHTML: block.querySelector('[data-price="true"]')?.outerHTML,
    }
  })

  console.log('\n=== SPAN DETAILS ===')
  result.spanDetails?.forEach((s, i) => {
    console.log(`Span ${i}: text="${s.text}" textContent="${s.textContent}" display=${s.display} visibility=${s.visibility} opacity=${s.opacity} aria-hidden=${s.ariaHidden} style="${s.style}" class="${s.className}"`)
  })
  console.log('\n=== BOLD ELEMENT innerText ===')
  console.log(result.boldElInnerText)
  console.log('\n=== data-price element ===')
  console.log(result.dataPriceEl, result.dataPriceElHTML)
  console.log('\n=== FULL BOLD HTML ===')
  console.log(result.boldElHTML)

  await browser.close()
}

debug().catch(console.error)