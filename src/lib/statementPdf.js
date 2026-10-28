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
  const body = lines.slice(start)

  // Headings are often centred over their column (a wide "Narration" column whose text starts far left of its
  // heading), so where the text columns really start is read from the rows themselves: the left edges that
  // many cells share. With one such edge per text heading they are matched left to right.
  const textCols = head.cells.map((c, i) => i).filter(i => !numericCols.includes(i))
  const edges = []
  // only lines inside the transaction rows count (not page titles, address blocks or footers)
  const isDateLine = cells => cells.some(c => DATE_AT_START.test(c.text))
  const inRows = body.filter((cells, i) => {
    const same = body.filter(l => l.page === cells.page)
    return same.indexOf(cells) >= same.findIndex(isDateLine) && same.indexOf(cells) <= same.length - 1 - [...same].reverse().findIndex(isDateLine)
  })
  for (const cells of inRows) for (const c of cells) {
    if (MONEY.test(c.text)) continue
    const e = edges.find(e => Math.abs(e.x - c.x0) <= 2.5)
    e ? (e.n++, e.x = (e.x * (e.n - 1) + c.x0) / e.n) : edges.push({ x: c.x0, n: 1 })
  }
  const dateRows = body.filter(cells => cells.some(c => DATE_AT_START.test(c.text))).length
  const anchors = edges.filter(e => e.n >= Math.max(3, dateRows * 0.1)).sort((a, b) => a.x - b.x).map(e => e.x)
  const useAnchors = anchors.length === textCols.length

  for (const cells of body) {
    const row = headerText.map(() => '')
    for (const c of cells) {
      let col
      if (MONEY.test(c.text) && numericCols.length) {
        // amounts are right-aligned under their heading: pick the numeric column whose right edge is nearest
        col = numericCols.reduce((best, i) => (Math.abs(head.cells[i].x1 - c.x1) < Math.abs(head.cells[best].x1 - c.x1) ? i : best), numericCols[0])
      } else if (useAnchors) {
        let k = 0
        for (let i = 0; i < anchors.length; i++) if (c.x0 >= anchors[i] - 3) k = i
        col = textCols[k]
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
  return foldContinuations(table, head.cols, lines.slice(start).map(l => l.page))
}

// A transaction often takes 2-4 printed lines: the date sits on the first, the long narration wraps over all of
// them, and the reference / value date / amounts sit on whichever line is level with the middle of the cell, so
// the lines above AND below them belong to the same transaction. A new transaction starts at a line whose DATE
// column holds a date (a value date in another column does not count). Lines are then joined cell by cell.
const DATE_AT_START = /^(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{1,2}[ -][A-Za-z]{3}[a-z]*[ -,]*\d{2,4})/
const FOOTER = /(statement summary|end of statement|generated (on|by)|this is a computer|registered office|closing balance\s*:|page \d+ of \d+|gstin|state account branch)/i

function foldContinuations(table, c, pages) {
  const hdr = norm(table[0].join(' '))
  const out = [table[0]]
  let cur = null, curPage = null, stop = false
  table.slice(1).forEach((row, i) => {
    if (stop) return
    const line = norm(row.join(' '))
    if (!line || line === hdr || JUNK.test(line)) return
    if (FOOTER.test(row.join(' '))) { if (/end of statement|statement summary/i.test(row.join(' '))) stop = true; cur = null; return }
    const starts = DATE_AT_START.test((row[c.date] || '').trim())
    if (starts) { cur = row.slice(); curPage = pages[i]; out.push(cur); return }
    if (!cur || pages[i] !== curPage) return // text above the first transaction of a page: not part of one
    row.forEach((v, k) => {
      if (!v) return
      if (k === c.narration) cur[k] = `${cur[k]} ${v}`.trim().slice(0, 300)
      else if (!cur[k]) cur[k] = v
      else if (k !== c.date && !MONEY.test(v)) cur[k] = `${cur[k]} ${v}`.trim()
    })
  })
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
    for (const l of pageLines((await page.getTextContent()).items)) { l.page = p; lines.push(l) }
  }
  await task.destroy()
  if (!lines.length) throw new Error('This PDF has no readable text (it may be a scanned image). Download the statement as CSV or Excel instead.')
  return linesToTable(lines)
}
