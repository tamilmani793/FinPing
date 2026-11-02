// Prints docs/demo.html to docs/FinPing-Demo.pdf (A4) with Chrome or Edge.
//   npm i --no-save puppeteer-core && node docs/tools/make-pdf.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import puppeteer from 'puppeteer-core'

const docs = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const html = path.resolve(process.argv[2] || path.join(docs, 'demo.html'))
const out = path.resolve(process.argv[3] || path.join(docs, 'FinPing-Demo.pdf'))
const CANDIDATES = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean)
const executablePath = CANDIDATES.find(p => fs.existsSync(p))
if (!executablePath) throw new Error('No Chrome or Edge found. Set CHROME to the browser path.')

const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--allow-file-access-from-files'] })
const page = await browser.newPage()
await page.goto(pathToFileURL(html).href, { waitUntil: 'load' })
await page.evaluate(() => Promise.all([...document.images].map(i => (i.complete ? null : new Promise(r => { i.onload = i.onerror = r })))))
await page.pdf({ path: out, format: 'A4', printBackground: true, preferCSSPageSize: true })
await browser.close()
console.log('wrote', out)
