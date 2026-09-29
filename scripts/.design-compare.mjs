// Throwaway: screenshot an r10 mockup and the real app route side by side.
// node scripts/.design-compare.mjs <mockup.html> <app-route> <width> <outDir>
// e.g. node scripts/.design-compare.mjs r8-master.html /desk/master 1440 /tmp/x
import { chromium } from '@playwright/test'
import * as desk from './visual-fixtures/desk.mjs'

const [mock, route, w = '1440', out = '.'] = process.argv.slice(2)
const width = Number(w)
const browser = await chromium.launch()
const json = (body) => (r) => r.request().method() === 'GET'
  ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  : r.continue()

async function shoot(url, name, fixtures) {
  const page = await browser.newPage({ viewport: { width, height: 1000 }, deviceScaleFactor: 1, reducedMotion: 'reduce' })
  if (fixtures) {
    await page.route(/\/api\/desk\/dashboard(\?|$)/, json(desk.dashboard))
    await page.route(/\/api\/desk\/operators(\?|$)/, json(desk.operators))
    await page.route(/\/api\/desk\/master(\?|$)/, json(desk.master))
    await page.route(/\/api\/desk\/passes(\?|$)/, json(await desk.passesFor(width < 700 ? 'mobile' : 'web')))
    // Not mocking this left "Send all unsent" permanently disabled (canSend
    // false), which made every button in the header/sheet render in its
    // disabled look regardless of the real component CSS.
    await page.route(/\/api\/desk\/passes\/send(\?|$)/, json({ configured: true, canSend: true, people: [] }))
  }
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)
  const file = `${out}/${name}-${width}.png`
  await page.screenshot({ path: file, fullPage: true })
  console.log(file, await page.evaluate(() => document.documentElement.scrollHeight))
  await page.close()
}

await shoot(`http://localhost:4455/design/source/r10/${mock}`, 'design', false)
await shoot(`http://localhost:3000${route}`, 'app', true)
await browser.close()
