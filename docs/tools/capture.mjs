// Takes the screenshots used by the README and the demo PDF, with made-up data (see demo-data.js).
//
//   1. start the app:            npm run dev            (note the address it prints)
//   2. install the browser tool: npm i --no-save puppeteer-core
//   3. run:                      node docs/tools/capture.mjs http://localhost:5173
//
// It needs Google Chrome or Microsoft Edge installed; set CHROME to its path if it is not found.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

const here = path.dirname(fileURLToPath(import.meta.url))
const base = process.argv[2] || 'http://localhost:5173'
const out = process.argv[3] || path.join(here, '..', 'screens')
fs.mkdirSync(out, { recursive: true })
const CANDIDATES = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean)
const executablePath = CANDIDATES.find(p => fs.existsSync(p))
if (!executablePath) throw new Error('No Chrome or Edge found. Set CHROME to the browser path.')

const wait = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
page.on('pageerror', e => console.log('page error:', e.message))
await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 120000 }); await wait(6000)
await page.addScriptTag({ content: fs.readFileSync(path.join(here, 'demo-data.js'), 'utf8') })
console.log('seeded', JSON.stringify(await page.evaluate(() => window.__seedDemo())))
await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 })
await wait(6000)

const tab = async t => { await page.evaluate(async x => (await import('/src/store/index.js')).useStore.getState().selectTab(x), t); await wait(900) }
const go = async t => { await page.evaluate(async x => (await import('/src/store/index.js')).useStore.getState().setActiveTab(x), t); await wait(1100) }
// click the first visible element whose own text is `text` (or contains it, with `part`)
const click = async (text, part = false) => {
  const ok = await page.evaluate((t, p) => {
    const els = [...document.querySelectorAll('*')].filter(e => (e.children.length === 0 || e.tagName === 'BUTTON') && (p ? (e.innerText ?? e.textContent ?? '').includes(t) : (e.innerText ?? e.textContent ?? '').trim() === t) && e.getBoundingClientRect().width > 0)
    if (!els.length) return false
    els[0].scrollIntoView({ block: 'center' }); els[0].click(); return true
  }, text, part)
  if (!ok) console.log('  could not find:', text)
  await wait(900)
}
const closeSheet = async () => { await page.evaluate(() => document.querySelector('.overlay')?.click()); await wait(500) }
const shot = async name => { await page.screenshot({ path: path.join(out, `${name}.png`) }); console.log('saved', name) }

// ── the screens ──
await tab('home'); await shot('01-home')
await tab('history'); await shot('02-history')
await tab('cards'); await shot('03-accounts')
await tab('bills'); await shot('04-bills')
await click('Home electricity'); await shot('05-electricity'); await closeSheet()
await click('HDFC Millennia ••4821', true); await shot('06-card-statements'); await closeSheet()
await tab('wealth'); await shot('07-wealth')
await click('PPF', true); await click('PPF - SBI', true); await shot('08-ppf'); await closeSheet(); await closeSheet()
await go('money'); await shot('09-money-hub')
await go('salary'); await shot('10-salary')
await go('pf'); await shot('11-provident-fund')
await go('debt'); await shot('12-debt-loans')
await click('Home loan'); await click('Prepay what-if', true)
await page.evaluate(() => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; const ins = [...document.querySelectorAll('.sheet input')]; set.call(ins[0], '300000'); ins[0].dispatchEvent(new Event('input', { bubbles: true })); set.call(ins[1], '5000'); ins[1].dispatchEvent(new Event('input', { bubbles: true })) }); await wait(700)
await shot('13-prepay-what-if'); await closeSheet()
await go('insurance'); await shot('14-insurance')
await go('sinking'); await shot('15-yearly-costs')
await go('cardadvisor'); await shot('16-card-advisor')
await go('money'); await click('Advisory'); await wait(500); await click('Run the check', true); await wait(2500); await shot('17-advisory'); await closeSheet()
await go('charts'); await shot('18-charts')
await go('profile'); await shot('19-profile')

await browser.close()
