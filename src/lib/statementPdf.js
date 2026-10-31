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
const MONEY = /^[+-]?\s*(?:[C₹]|Rs\.?|INR)?\s*[(]?-?[\d,]+\.\d{1,2}[)]?\s*(dr|cr)?$/i
const JUNK = /^(page \d+|page no|statement of account|account statement for|account statement from|opening balance|closing balance|generated|registered office|this is a computer|end of statement|\*+|continued)/i

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
    const out = cells.map(c => ({ ...c, text: c.text.replace(/\s+/g, ' ').trim() }))
    out.y = l.y
    return out
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

// The same heading can sit at different x positions on each page (HDFC card statements shift the table on the first page),
// so every page is read against its own heading line.
function findPageHeader(pl, hdrNorm) {
  for (let j = 0; j < Math.min(pl.length, 60); j++) {
    if (norm(pl[j].map(c => c.text).join(' ')) === hdrNorm) return { cells: pl[j], end: j + 1 }
    if (pl[j + 1]) {
      const m = mergeLines(pl[j], pl[j + 1])
      if (norm(m.map(c => c.text).join(' ')) === hdrNorm) return { cells: m, end: j + 2 }
    }
  }
  return null
}

export function linesToTable(lines) {
  const head = findHeader(lines)
  if (!head) throw new Error("Couldn't find the transaction table in this PDF. Download the statement as CSV or Excel from net banking instead.")
  const headerText = head.cells.map(c => c.text)
  const hdrNorm = norm(headerText.join(' '))
  const numericCols = head.cells.map((c, i) => i).filter(i => [head.cols.debit, head.cols.credit, head.cols.amount, head.cols.balance].includes(i))
  const table = [headerText], pagesOut = [], ysOut = []
  const headerLine = lines[head.index]
  let cells = head.cells
  for (const p of [...new Set(lines.map(l => l.page))]) {
    if (p < headerLine.page) continue
    const pl = lines.filter(l => l.page === p)
    let start = 0
    if (p === headerLine.page) start = pl.indexOf(headerLine) + 1
    else { const found = findPageHeader(pl, hdrNorm); if (found) { cells = found.cells; start = found.end } }
    for (const r of assignRows(pl.slice(start), cells, head.cols, numericCols, headerText.length)) { table.push(r.row); pagesOut.push(p); ysOut.push(r.y) }
  }
  return foldContinuations(table, head.cols, pagesOut, ysOut)
}

// the lines of one page -> table rows, placing every cell under its heading
function assignRows(body, headCells, cols, numericCols, width) {
  // Headings are often centred over their column (a wide "Narration" column whose text starts far left of its
  // heading), so where the text columns really start is read from the rows themselves: the left edges that
  // many cells share. With one such edge per text heading they are matched left to right.
  const textCols = headCells.map((c, i) => i).filter(i => !numericCols.includes(i))
  const edges = []
  // only lines that belong to a transaction count (not page titles, address blocks or footers): a line with a date AND an
  // amount, and the few unamounted lines right after it
  const hasMoney = cells => cells.some(c => MONEY.test(c.text))
  const isDateLine = cells => cells.some(c => DATE_AT_START.test(c.text)) && hasMoney(cells)
  const inRows = []
  body.forEach((cells, i) => {
    if (isDateLine(cells)) { inRows.push(cells); return }
    for (let j = i - 1; j >= 0 && i - j <= 5; j--) {
      if (hasMoney(cells)) break
      if (isDateLine(body[j])) { if (Math.min(...cells.map(c => c.x0)) >= Math.min(...body[j].map(c => c.x0)) + 5) inRows.push(cells); break }
      if (hasMoney(body[j])) break
    }
  })
  for (const cells of inRows) for (const c of cells) {
    if (MONEY.test(c.text)) continue
    const e = edges.find(e => Math.abs(e.x - c.x0) <= 2.5)
    e ? (e.n++, e.x = (e.x * (e.n - 1) + c.x0) / e.n) : edges.push({ x: c.x0, n: 1 })
  }
  const dateRows = body.filter(cells => cells.some(c => DATE_AT_START.test(c.text))).length
  const anchors = edges.filter(e => e.n >= Math.max(2, dateRows * 0.1)).sort((a, b) => a.x - b.x).map(e => e.x)
  const useAnchors = anchors.length === textCols.length
  const lastAmountRight = Math.max(0, ...body.flatMap(cells => cells.filter(c => MONEY.test(c.text)).map(c => c.x1)))
  const narrationAfterAmounts = cols.narration > Math.max(...numericCols, -1)

  const dateXs = body.map(cells => cells.find(c => DATE_AT_START.test(c.text) && cells.some(k => MONEY.test(k.text)))).filter(Boolean).map(c => c.x0).sort((p, q) => p - q)
  const pageDateX0 = dateXs.length ? dateXs[Math.floor(dateXs.length / 2)] : null
  const pageMoneyX0 = Math.min(1e9, ...body.flatMap(cells => cells.filter(c => MONEY.test(c.text)).map(c => c.x0)))

  return body.map(cells => {
    const row = Array.from({ length: width }, () => '')
    // Text between the date and the first amount is the description, whatever the heading position says; a reference
    // number or a second date in that stretch keeps its own column
    const dateCell = cells.find(c => DATE_AT_START.test(c.text))
    const moneyX0 = Math.min(1e9, ...cells.filter(c => MONEY.test(c.text)).map(c => c.x0))
    for (const c of cells) {
      let col
      if (MONEY.test(c.text) && numericCols.length) {
        // amounts are right-aligned under their heading: pick the numeric column whose right edge is nearest
        col = numericCols.reduce((best, i) => (Math.abs(headCells[i].x1 - c.x1) < Math.abs(headCells[best].x1 - c.x1) ? i : best), numericCols[0])
      } else if (narrationAfterAmounts && !DATE_ONLY.test(c.text) && c.x0 >= lastAmountRight - 4) {
        col = cols.narration
      } else if (useAnchors && !narrationAfterAmounts) {
        let k = 0
        for (let i = 0; i < anchors.length; i++) if (c.x0 >= anchors[i] - 3) k = i
        col = textCols[k]
      } else if (!useAnchors && !narrationAfterAmounts && dateCell === c) {
        col = cols.date
      } else if (!useAnchors && !narrationAfterAmounts && pageDateX0 != null && !DATE_ONLY.test(c.text) && !(cols.ref >= 0 && /^[A-Za-z]{0,4}\d{9,}$/.test(c.text))
        && c.x0 >= (dateCell ? dateCell.x1 : pageDateX0) - 5 + (dateCell ? 0 : 10) && c.x0 < Math.min(moneyX0, pageMoneyX0) - 4) {
        col = cols.narration
      } else {
        const lefts = headCells.map(h => h.x0 - 3)
        col = 0
        for (let i = 0; i < lefts.length; i++) if (c.x0 >= lefts[i]) col = i
        if (numericCols.includes(col) && !MONEY.test(c.text)) col = cols.narration
      }
      row[col] = row[col] ? `${row[col]} ${c.text}` : c.text
    }
    return { row, y: cells.y }
  })
}

// A transaction often takes 2-4 printed lines: the date sits on the first, the long narration wraps over all of
// them, and the reference / value date / amounts sit on whichever line is level with the middle of the cell, so
// the lines above AND below them belong to the same transaction. A new transaction starts at a line whose DATE
// column holds a date (a value date in another column does not count). Lines are then joined cell by cell.
const DATE_ONLY = /^(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{1,2}[ -][A-Za-z]{3}[a-z]*[ ,.-]*\d{2,4})$/
const DATE_AT_START = /^(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{1,2}[ -][A-Za-z]{3}[a-z]*[ ,.-]*\d{2,4})/
const FOOTER = /(statement summary|end of statement|generated (on|by)|this is a computer|registered office|closing balance\s*:|page \d+ of \d+|gstin|state account branch)/i

function foldContinuations(table, c, pages, ys = []) {
  const hdr = norm(table[0].join(' '))
  const out = [table[0]]
  // Is the narration printed around the date line (some of it above it)? Then text before a page's first date line
  // belongs to that date line, and every loose line goes to the NEAREST date line instead of the previous one.
  const usable = table.slice(1).map((row, i) => ({ row, i })).filter(({ row }) => { const line = norm(row.join(' ')); return line && line !== hdr && !JUNK.test(line) && !FOOTER.test(row.join(' ')) })
  const firstOnPage = usable.find(u => pages[u.i] === pages[usable[0]?.i])
  const centred = !!firstOnPage && !DATE_AT_START.test((firstOnPage.row[c.date] || '').trim()) && ys.length > 0
  if (centred) {
    const dates = usable.filter(u => DATE_AT_START.test((u.row[c.date] || '').trim()))
    const blocks = new Map(dates.map(d => [d.i, [d]]))
    for (const u of usable) {
      if (blocks.has(u.i)) continue
      let best = null
      for (const d of dates) if (pages[d.i] === pages[u.i] && (!best || Math.abs(ys[d.i] - ys[u.i]) < Math.abs(ys[best.i] - ys[u.i]))) best = d
      if (best && Math.abs(ys[best.i] - ys[u.i]) < 30) blocks.get(best.i).push(u)
    }
    for (const [di, list] of blocks) {
      list.sort((p, q) => ys[q.i] - ys[p.i])
      const merged = table[0].map(() => '')
      for (const u of list) u.row.forEach((v, k) => {
        if (!v) return
        if (k === c.narration) merged[k] = `${merged[k]} ${v}`.trim().slice(0, 300)
        else if (!merged[k]) merged[k] = v
        else if (k !== c.date && !MONEY.test(v)) merged[k] = `${merged[k]} ${v}`.trim()
      })
      out.push(merged)
    }
    return out
  }
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
  // a transaction whose narration column stayed empty takes the leftover text cells as its description
  for (const row of out.slice(1)) {
    if (String(row[c.narration] || '').trim()) continue
    row[c.narration] = row.filter((v, k) => v && k !== c.date && !MONEY.test(v) && !(c.balance === k) && k !== c.ref && !DATE_ONLY.test(v)).join(' ')
  }
  return out
}

// Many banks print their own totals ("Opening Balance | Dr Count | Cr Count | Debits | Credits | Closing Balance" and a row of
// numbers under it). They are used afterwards to prove that every line was read.
export function findSummary(lines) {
  const text = l => l.map(c => c.text).join(' ')
  for (let i = 0; i < lines.length - 1; i++) {
    const head = text(lines[i]).toLowerCase()
    if (!(/dr\s*count/.test(head) && /cr\s*count/.test(head) && /debits/.test(head) && /credits/.test(head))) continue
    const nums = (text(lines[i + 1]).match(/-?[\d,]*\d(?:\.\d{1,2})?/g) || []).map(x => parseFloat(x.replace(/,/g, '')))
    const order = [['opening', head.indexOf('opening')], ['drCount', head.search(/dr\s*count/)], ['crCount', head.search(/cr\s*count/)], ['debits', head.search(/debits/)], ['credits', head.search(/credits/)], ['closing', head.indexOf('closing')]]
      .filter(([, p]) => p >= 0).sort((a, b) => a[1] - b[1]).map(([k]) => k)
    if (nums.length !== order.length) return null
    return Object.fromEntries(order.map((k, j) => [k, nums[j]]))
  }
  return null
}

// A credit card statement's own first-page summary (HDFC layout): statement date, total amount due, minimum due, due date and
// the credit limits. Used to bring the card's bill details up to what the bank printed.
const num = x => parseFloat(String(x).replace(/,/g, ''))
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 }
const dateOf = t => { const m = String(t).match(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*,?\s+(\d{4})/); return m && MONTHS[m[2].toLowerCase()] != null ? new Date(+m[3], MONTHS[m[2].toLowerCase()], +m[1], 12) : null }
export function findCardSummary(lines) {
  const text = lines.filter(l => l.page <= 2).map(l => l.map(c => c.text).join(' | '))
  const out = {}
  const sd = text.find(t => /^statement date\b/i.test(t))
  if (sd) out.statementDate = dateOf(sd)
  // "C | 1,801.65 | C | 1,802.00 | + | C | 9,584.00 | + | C | 0.00 | = | C | 9,584.00": the amount after the "=" is the total due
  const eq = text.find(t => /\|\s*=\s*\|/.test(t) && /[\d,]+\.\d\d/.test(t))
  if (eq) {
    const m = eq.split(/\|\s*=\s*\|/)[1].match(/[\d,]*\d\.\d\d/); if (m) out.totalDue = num(m[0])
    // previous dues, payments received, purchases, finance charges, then the total
    const all = (eq.match(/[\d,]*\d\.\d\d/g) || []).map(num)
    if (all.length === 5) out.purchases = all[2]
  }
  // "C | 480.00 | 04 Nov, 2026": minimum due and due date
  const md = text.find(t => /\d{1,2}\s+[A-Za-z]{3},?\s+\d{4}/.test(t) && /[\d,]+\.\d\d/.test(t) && !/^statement date|billing period/i.test(t) && !/=/.test(t))
  if (md) { out.dueDate = dateOf(md); const m = md.match(/[\d,]*\d\.\d\d/); if (m) out.minDue = num(m[0]) }
  // "C | 3,66,000 | C | 3,53,787 | C | 1,46,400": total limit, available limit, available cash limit
  const lim = text.find(t => /^[C₹\s|]*\d[\d,]{4,}[\s|C₹]+\d[\d,]{3,}[\s|C₹]+\d[\d,]{3,}[\s|]*$/.test(t))
  if (lim) { const n = lim.match(/\d[\d,]*\d/g).map(num); out.creditLimit = n[0]; out.availableCredit = n[1] }
  // Reward points, any page. Two layouts:
  //   a heading "Reward Points" with the closing balance under it, then a header row "Opening Balance | Earned | Disbursed | Adjusted/Lapsed" and a row of four numbers
  //   (HDFC Millennia and others); or one line holding "reward points" and "opening balance" followed by the row of four numbers.
  const all = lines.map(l => l.map(c => c.text).join(' | '))
  const nums = t => (String(t || '').match(/\d[\d,]*/g) || []).map(num)
  const hi = all.findIndex(t => /opening balance/i.test(t) && /earned/i.test(t) && /(disbursed|redeemed)/i.test(t))
  const oldStyle = all.findIndex(t => /reward points/i.test(t) && /opening balance/i.test(t))
  const hdr = hi >= 0 ? hi : oldStyle
  if (hdr >= 0) {
    const row = nums(all[hdr + 1])
    if (row.length >= 4) {
      out.rewardsOpening = row[0]; out.rewardsEarned = row[1]; out.rewardsDisbursed = row[2]; out.rewardsLapsed = row[3]
      // the closing balance: a lone number under the "Reward Points" heading just above, or the number on the line after the row
      let closing = null
      for (let k = hdr - 1; k >= Math.max(0, hdr - 6) && closing == null; k--) {
        if (/^[|\s]*reward points[|\s]*$/i.test(all[k]) && nums(all[k + 1]).length === 1) closing = nums(all[k + 1])[0]
      }
      if (closing == null && nums(all[hdr + 2]).length === 1 && /^[|\s]*[\d,]+[|\s]*$/.test(all[hdr + 2])) closing = nums(all[hdr + 2])[0]
      out.rewardPoints = closing != null ? closing : Math.max(0, row[0] + row[1] - row[2] - row[3])
    }
  }
  // "Rewards Program Points Summary": where the points of the cycle came from, one row per programme ("1% CashBack on all_other_Spends | 15 pts")
  const pi = all.findIndex(t => /rewards? program(?:me)? points summary/i.test(t))
  if (pi >= 0) {
    const programs = []
    for (let k = pi + 1; k < Math.min(all.length, pi + 40); k++) {
      const m = all[k].match(/^[|\s]*(\d+)[\s|]+(.+?)[\s|]+(\d[\d,]*)\s*(?:pts?|points?)/i)
      if (m) programs.push({ name: m[2].replace(/[\s|]+/g, ' ').trim(), points: num(m[3]) })
      else if (programs.length) break
    }
    if (programs.length) out.rewardPrograms = programs
  }
  return out.totalDue != null && out.statementDate ? out : null
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
  const table = linesToTable(lines)
  table.summary = findSummary(lines)
  table.cardSummary = findCardSummary(lines)
  return table
}
