require('dotenv').config()
const { chromium } = require('playwright')

async function debug() {
  const url = 'https://demo.inelabteamdev.com/product/163'
  
  // Try with headless: false AND slowMo to simulate real user
  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 100 // slow down all operations by 100ms
  })
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  })
  
  const page = await context.newPage()

  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
  await new Promise(r => setTimeout(r, 3000))

  const box = await page.locator('.price-block').boundingBox()
  const centerX = box.x + box.width / 2
  const centerY = box.y + box.height / 2

  // Strategy 1: Move mouse very slowly in many small steps
  console.log('Moving mouse slowly...')
  const steps = 20
  for (let i = 0; i <= steps; i++) {
    await page.mouse.move(
      (centerX / steps) * i,
      (centerY / steps) * i
    )
    await new Promise(r => setTimeout(r, 50))
  }
  
  await new Promise(r => setTimeout(r, 2000))
  
  let btnState = await page.evaluate(() => document.querySelector('.price-block button')?.disabled)
  console.log('After slow move - button disabled:', btnState)

  // Strategy 2: Force CSS hover state via JS
  console.log('Forcing CSS hover state...')
  await page.evaluate(() => {
    const style = document.createElement('style')
    // Force the price-block to look like it's being hovered
    style.textContent = `.price-block { pointer-events: auto !important; }`
    document.head.appendChild(style)
    
    // Try to force the button enabled directly
    const btn = document.querySelector('.price-block button')
    if (btn) {
      btn.disabled = false
      btn.removeAttribute('disabled')
    }
    
    // Also try triggering the component's internal state
    // React stores state on the DOM element
    const block = document.querySelector('.price-block')
    if (block) {
      // Find React fiber
      const key = Object.keys(block).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'))
      console.log('React fiber key:', key)
    }
  })

  await new Promise(r => setTimeout(r, 1000))
  
  // Try clicking the now-unblocked button
  try {
    await page.click('.price-block button', { force: true })
    console.log('Clicked button with force')
  } catch(e) {
    console.log('Click failed:', e.message)
  }

  await new Promise(r => setTimeout(r, 3000))

  // Strategy 3: Intercept network requests — maybe price loads via API call
  console.log('\nChecking if price loads via API...')
  
  // Reload page and intercept all requests
  const requests = []
  page.on('request', req => {
    if (!req.url().includes('favicon') && !req.url().includes('.js') && !req.url().includes('.css')) {
      requests.push({ url: req.url(), method: req.method() })
    }
  })
  page.on('response', async res => {
    const url = res.url()
    if (!url.includes('favicon') && !url.includes('.js') && !url.includes('.css') && !url.includes('.svg')) {
      try {
        const text = await res.text()
        if (text.includes('price') || text.includes('stock') || text.includes('₹')) {
          console.log('INTERESTING RESPONSE from:', url)
          console.log('Body:', text.slice(0, 500))
        }
      } catch {}
    }
  })

  await page.reload({ waitUntil: 'networkidle' })
  await new Promise(r => setTimeout(r, 2000))
  
  // Now hover properly
  await page.mouse.move(centerX, centerY)
  await new Promise(r => setTimeout(r, 5000))

  console.log('\nAll non-asset requests:')
  requests.forEach(r => console.log(r.method, r.url))

  const finalHTML = await page.evaluate(() => document.querySelector('.price-block')?.outerHTML)
  console.log('\nFinal block HTML:', finalHTML)

  await browser.close()
}

debug().catch(console.error)