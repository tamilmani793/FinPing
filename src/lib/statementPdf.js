// Reads a bank statement PDF on this device (pdf.js runs in the browser, nothing is uploaded) and turns it
// into the same table the CSV / Excel reader produces. Password-protected statements are opened with the
// password you type; it is kept in memory only for that one read. A PDF's "no printing / no copying"
// restrictions need no password to read and are not a problem.
import { detectColumns } from './statement'

// older phones / runtimes lack this; pdf.js needs it
if (!Promise.withResolvers) Promise.withResolvers = function () { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }

export class PasswordNeeded extends Error {
  constructor(wrong) {
    super(wrong ? 'That password is not right. Try again.' : 'This PDF is password-protected. Enter its password to open it on this device.')
    this.needPassword = true
    this.wrong = !!wrong
  }
}

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9/ ]/g, ' ').replace(/\s+/g, ' ').trim()
const MONEY = /^[(]?[\d,]+\.\d{1,2}[)]?\s*(dr|cr)?$/i
const JUNK = /^(page \d+|page no|statement of account|opening balance|closing balance|generated|registered office|this is a computer|end of statement|\*+|continued)/i

// text items of one page -> lines of cells, each cell {text, x0, x1}
function pageLines(items) {
  const lines = []
  for (const it of items) {
    const text = it.str
    if (!text || !text.trim()) continue
    const x0 = it.transform[4], y = it.transform[5]
    let line = lines.find(l => Math.abs(l.y - y) < 3)
    if (!line) lines.push(line = { y, items: [] })
    line.items.push({ text, x0, x1: x0 + (it.width || 0) })
  }
  lines.sort((a, b) => b.y - a.y) // PDF y grows upwards
  return lines.map(l => {
    const cells = []
    for (const it of l.items.sort((a, b) => a.x0 - b.x0)) {
      const last = cells[cells.length - 1]
      // words of one cell sit close together; a wide gap starts the next column
      if (last && it.x0 - last.x1 < 4.5) { last.text += (it.x0 - last.x1 > 0.5 ? ' ' : '') + it.text; last.x1 = Math.max(last.x1, it.x1) }
      else cells.push({ text: it.text, x0: it.x0, x1: it.x1 })
    }
    return cells.map(c => ({ ...c, text: c.text.replace(/\s+/g, ' ').trim() }))
  })
}

// A header can wrap over two lines ("Withdrawal" / "Amt."): join the two where their columns overlap
function mergeLines(a, b) {
  const out = a.map(c => ({ ...c }))
  for (const c of b) {
    const hit = out.find(o => c.x0 < o.x1 + 4 && c.x1 > o.x0 - 4)
    if (hit) { hit.text += ' ' + c.text; hit.x0 = Math.min(hit.x0, c.x0); hit.x1 = Math.max(hit.x1, c.x1) } else out.push({ ...c })
  }
  return out.sort((p, q) => p.x0 - q.x0)
}

function findHeader(lines) {
  const lim = Math.min(lines.length, 60)
  // a header on one line first; only then one split over two lines (so a title above it is not mistaken for part of it)
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < lim; i++) {
      const cells = pass === 0 ? lines[i] : (lines[i + 1] ? mergeLines(lines[i], lines[i + 1]) : null)
      if (!cells || cells.length < 3) continue
      const c = detectColumns([cells.map(x => x.text)])
      if (c) return { index: i + pass, cells, cols: c }
    }
  }
  return null
}

export function linesToTable(lines) {
  const head = findHeader(lines)
  if (!head) throw new Error("Couldn't find the transaction table in this PDF. Download the statement as CSV or Excel from net banking instead.")
  const headerText = head.cells.map(c => c.text)
  const numericCols = head.cells.map((c, i) => i).filter(i => [head.cols.debit, head.cols.credit, head.cols.amount, head.cols.balance].includes(i))
  const table = [headerText]
  const start = head.index + 1
  for (const cells of lines.slice(start)) {
    const row = headerText.map(() => '')
    for (const c of cells) {
      let col
      if (MONEY.test(c.text) && numericCols.length) {
        // amounts are right-aligned under their heading: pick the numeric column whose right edge is nearest
        col = numericCols.reduce((best, i) => (Math.abs(head.cells[i].x1 - c.x1) < Math.abs(head.cells[best].x1 - c.x1) ? i : best), numericCols[0])
      } else {
        const lefts = head.cells.map(h => h.x0 - 3)
        col = 0
        for (let i = 0; i < lefts.length; i++) if (c.x0 >= lefts[i]) col = i
        if (numericCols.includes(col) && !MONEY.test(c.text)) col = head.cols.narration
      }
      row[col] = row[col] ? `${row[col]} ${c.text}` : c.text
    }
    table.push(row)
  }
  return foldContinuations(table, head.cols)
}

// narration text that wrapped onto the next line belongs to the row above it; repeated headers and footers are dropped
function foldContinuations(table, c) {
  const hdr = norm(table[0].join(' '))
  const out = [table[0]]
  for (const row of table.slice(1)) {
    const line = norm(row.join(' '))
    if (!line || line === hdr || JUNK.test(line)) continue
    const hasDate = /\d/.test(row[c.date] || '')
    const hasMoney = row.some((v, i) => i !== c.date && MONEY.test(v || ''))
    if (!hasDate && !hasMoney && out.length > 1) {
      const prev = out[out.length - 1]
      prev[c.narration] = `${prev[c.narration]} ${row.filter(Boolean).join(' ')}`.trim().slice(0, 300)
      continue
    }
    out.push(row)
  }
  return out
}

// `pdfjs` can be handed in (tests); the app loads it on first use so it is not part of the normal start-up
export async function parsePdf(arrayBuffer, password, pdfjs) {
  if (!pdfjs) {
    pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default
  }
  let doc, task
  try {
    task = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer), password: password || undefined, isEvalSupported: false })
    doc = await task.promise
  } catch (e) {
    if (e?.name === 'PasswordException') throw new PasswordNeeded(e.code === 2 || !!password)
    throw new Error('Could not open this PDF. It may be damaged, or not a bank statement.')
  }
  const lines = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    lines.push(...pageLines((await page.getTextContent()).items))
  }
  await task.destroy()
  if (!lines.length) throw new Error('This PDF has no readable text (it may be a scanned image). Download the statement as CSV or Excel instead.')
  return linesToTable(lines)
}
