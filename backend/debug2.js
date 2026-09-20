require('dotenv').config()
const { chromium } = require('playwright')

async function debug() {
  const url = 'https://demo.inelabteamdev.com/product/163'
  const browser = await chromium.launch({ headless: false }) // HEADED so we can see what happens
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  })
  const page = await context.newPage()

  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
  await new Promise(r => setTimeout(r, 2000))

  // Get the price block's position on screen
  const box = await page.locator('.price-block').boundingBox()
  console.log('Price block position:', box)

  if (box) {
    // Move mouse slowly across the price block (simulate real movement)
    const centerX = box.x + box.width / 2
    const centerY = box.y + box.height / 2

    // Move mouse in small steps toward the price block
    await page.mouse.move(0, 0)
    await new Promise(r => setTimeout(r, 500))
    await page.mouse.move(centerX / 2, centerY / 2)
    await new Promise(r => setTimeout(r, 500))
    await page.mouse.move(centerX, centerY)
    await new Promise(r => setTimeout(r, 500))

    console.log('Moved mouse to price block center:', centerX, centerY)

    // Check button state after mouse move
    const btnDisabled = await page.evaluate(() => {
      const btn = document.querySelector('.price-block button')
      return btn ? btn.disabled : 'no button'
    })
    console.log('Button disabled after mouse move:', btnDisabled)

    await new Promise(r => setTimeout(r, 2000))

    // Try dispatching raw mouse events
    await page.evaluate(({ x, y }) => {
      const el = document.querySelector('.price-block')
      if (!el) return
      el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, clientX: x, clientY: y }))
      el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: x, clientY: y }))
      el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: y }))
    }, { x: centerX, y: centerY })

    console.log('Dispatched mouse events')
    await new Promise(r => setTimeout(r, 3000))

    // Check button again
    const btnDisabled2 = await page.evaluate(() => {
      const btn = document.querySelector('.price-block button')
      return btn ? btn.disabled : 'no button'
    })
    console.log('Button disabled after events:', btnDisabled2)

    // Print full block HTML
    const html = await page.evaluate(() => document.querySelector('.price-block')?.outerHTML)
    console.log('Block HTML:', html)

    // Keep browser open 10 seconds so we can see it
    await new Promise(r => setTimeout(r, 10000))
  }

  await browser.close()
}

debug().catch(console.error)