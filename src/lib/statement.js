// Reads a bank statement (CSV, Excel .xlsx, or pasted text) into plain rows:
//   { date, narration, ref, debit, credit, balance }
// Banks lay these files out differently (HDFC "Withdrawal Amt." / "Deposit Amt.", SBI "Debit" / "Credit",
// ICICI "Transaction Remarks", Axis "PARTICULARS" / "DR" / "CR"...), so the header row and the columns
// are found by their names instead of by position.
import { classifyCategory } from './smsParser'
import { canonCategory } from './options'

// ───────────────────────────── text → table ─────────────────────────────

// CSV with quotes, any of , ; | tab as the separator
export function parseDelimited(text) {
  const src = String(text || '').replace(/^﻿/, '')
  const first = src.split(/\r?\n/).slice(0, 25).join('\n')
  const delim = [',', '\t', ';', '|'].map(d => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0]
  const rows = []
  let row = [], cell = '', quoted = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === delim) { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.some(c => c.trim() !== '')) rows.push(row)
      row = []
    } else cell += ch
  }
  row.push(cell)
  if (row.some(c => c.trim() !== '')) rows.push(row)
  return rows.map(r => r.map(c => c.trim()))
}

// ───────────────────────────── .xlsx (zip of XML) ─────────────────────────────

const u16 = (b, o) => b[o] | (b[o + 1] << 8)
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0

async function unzip(bytes) {
  let eocd = -1
  for (let i = bytes.length - 22; i >= 0; i--) if (u32(bytes, i) === 0x06054b50) { eocd = i; break }
  if (eocd < 0) throw new Error('This does not look like an Excel (.xlsx) file')
  const count = u16(bytes, eocd + 10)
  let p = u32(bytes, eocd + 16)
  const files = {}
  for (let n = 0; n < count; n++) {
    if (u32(bytes, p) !== 0x02014b50) break
    const method = u16(bytes, p + 10), csize = u32(bytes, p + 20)
    const nameLen = u16(bytes, p + 28), extraLen = u16(bytes, p + 30), commentLen = u16(bytes, p + 32), local = u32(bytes, p + 42)
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen))
    const dataStart = local + 30 + u16(bytes, local + 26) + u16(bytes, local + 28)
    files[name] = { method, data: bytes.subarray(dataStart, dataStart + csize) }
    p += 46 + nameLen + extraLen + commentLen
  }
  const read = async name => {
    const f = files[name]
    if (!f) return null
    if (f.method === 0) return new TextDecoder().decode(f.data)
    const stream = new Blob([f.data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
    return new TextDecoder().decode(await new Response(stream).arrayBuffer())
  }
  return { names: Object.keys(files), read }
}

const colIndex = ref => [...ref.replace(/\d+/g, '')].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1

export async function parseXlsx(arrayBuffer) {
  const zip = await unzip(new Uint8Array(arrayBuffer))
  const xml = s => new DOMParser().parseFromString(s, 'application/xml')
  const shared = []
  const ss = await zip.read('xl/sharedStrings.xml')
  if (ss) for (const si of xml(ss).getElementsByTagName('si')) shared.push([...si.getElementsByTagName('t')].map(t => t.textContent).join(''))
  // use the sheet with the most rows (statements are normally on the first sheet)
  let best = []
  for (const name of zip.names.filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))) {
    const doc = xml(await zip.read(name))
    const rows = []
    for (const r of doc.getElementsByTagName('row')) {
      const line = []
      for (const c of r.getElementsByTagName('c')) {
        const idx = colIndex(c.getAttribute('r') || 'A1')
        const t = c.getAttribute('t')
        const v = c.getElementsByTagName('v')[0]?.textContent
        let val = ''
        if (t === 's') val = shared[Number(v)] ?? ''
        else if (t === 'inlineStr') val = [...c.getElementsByTagName('t')].map(x => x.textContent).join('')
        else val = v ?? ''
        line[idx] = String(val).trim()
      }
      const full = Array.from(line, x => x ?? '')
      if (full.some(x => x !== '')) rows.push(full)
    }
    if (rows.length > best.length) best = rows
  }
  if (!best.length) throw new Error('No data found in that Excel file')
  return best
}

// ───────────────────────────── table → statement rows ─────────────────────────────

const MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 }

// "27/10/26", "27-10-2026", "27-Oct-2026", "27 Oct 2026", "2026-10-27", or an Excel date number
export function parseStatementDate(v) {
  const s = String(v ?? '').trim()
  if (!s) return null
  if (/^\d{5}(\.\d+)?$/.test(s) && Number(s) > 30000 && Number(s) < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 86400000)
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12)
  }
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], 12)
  m = s.match(/^(\d{1,2})[-/. ]([A-Za-z]{3})[a-z]*[-/. ,]*(\d{2,4})/)
  if (m && MON[m[2].toLowerCase()] != null) return new Date(m[3].length === 2 ? 2000 + +m[3] : +m[3], MON[m[2].toLowerCase()], +m[1], 12)
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/)
  if (m) return new Date(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2] - 1, +m[1], 12)
  return null
}

// "1,234.50", "1234.5 Dr", "(500.00)", "" -> number | null
function parseMoney(v) {
  const s = String(v ?? '').replace(/[₹,\s]|rs\.?|inr/gi, '')
  if (!s || s === '-') return null
  const n = parseFloat(s.replace(/[()]/g, '').replace(/(dr|cr)$/i, ''))
  return Number.isFinite(n) ? Math.abs(n) : null
}
const isCr = v => /cr$/i.test(String(v ?? '').trim())

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9/ ]/g, ' ').replace(/\s+/g, ' ').trim()

// finds the header row and which column is which
export function detectColumns(table) {
  for (let i = 0; i < Math.min(table.length, 40); i++) {
    const h = table[i].map(norm)
    const find = (...tests) => h.findIndex(c => c && tests.some(t => t.test(c)))
    const date = (() => {
      const exact = h.findIndex(c => /^(txn\.? |tran(saction)? |posting )?date$/.test(c))
      return exact >= 0 ? exact : find(/date|\bdt\b/)
    })()
    const debit = find(/withdraw/, /^debit/, /\bdebit amount/, /^dr\b/, /^dr$/)
    const credit = find(/deposit/, /^credit/, /\bcredit amount/, /^cr\b/, /^cr$/)
    const amount = find(/^amount/, /transaction amount/)
    const narration = find(/narration/, /description/, /particulars/, /remarks/, /transaction details/, /details/)
    if (date < 0 || narration < 0 || !((debit >= 0 && credit >= 0) || amount >= 0)) continue
    return {
      header: i, date, narration, debit, credit, amount,
      type: find(/dr\s*\/\s*cr/, /^type$/, /^cr\s*\/\s*dr/),
      ref: find(/chq/, /cheque/, /\bref/),
      balance: find(/balance/, /^bal\b/, /^bal$/),
    }
  }
  return null
}

// refs in a narration: UPI ids, RRNs, cheque / reference numbers (leading zeros dropped, so "0000629294174012" == "629294174012")
export const refsOf = (...texts) => {
  const out = new Set()
  for (const t of texts) for (const m of String(t || '').matchAll(/\d{9,16}/g)) out.add(m[0].replace(/^0+/, ''))
  return out
}

// Who the money went to / came from, read out of the bank's narration. Banks write it many ways:
//   UPI-AMAZON PAY-AMAZONPAY@APL-629294174012-Payment        (HDFC)
//   UPI/P2A/629294174012/RAHUL KUMAR/HDFC BANK/note          (Axis, ICICI)
//   TO TRANSFER-UPI/DR/629294174012/RAHUL K/SBIN/rahul@sbi/note   (SBI)
//   NEFT CR-SBIN0001234-ACME LTD-SALARY-SBIN123456789        IMPS-629294174012-RAHUL KUMAR-HDFC-XXXXXX1234-note
//   ATW-512345XXXXXX1234-ATM ONE,  POS 512345XXXXXX1234 SWIGGY,  ACH D- LIC OF INDIA-123456
const BANKY = /^(sbin|hdfc|icic|utib|kkbk|yesb|punb|barb|canb|ubin|idib|indb|bkid|fdrl|ratn|upi|neft|rtgs|imps|ach|nach|ecs|p2a|p2m|p2p|dr|cr|to|by|from|transfer|trf|xxxx?|bank|ltd|pvt)$/i
const isRef = x => /^\d{6,}$/.test(x) || /^[A-Z]{4}0[A-Z0-9]{6}$/i.test(x) || /^[A-Z]{3,5}\d{9,}$/i.test(x) || /^x{2,}\d{2,}$/i.test(x) || /^\d{4,}x+\d*$/i.test(x)
const KEEP_UP = /\b(Llp|Lic|Hdfc|Sbi|Icici|Upi|Atm|Emi|Irctc|Bsnl|Nse|Bse|Gst|Epfo|Nps|Sip|Cbdc)\b/g
const nice = t => t.toLowerCase().replace(/(^|[\s.&'(-])([a-z])/g, (_, p, c) => p + c.toUpperCase()).replace(KEEP_UP, w => w.toUpperCase())
// words that are the payer's remark or the app used, not a name
const REMARK = /^(sent using|paid via|payment (to|from)|request from|no remark|upi$|repayment|unload|load|payment$)/i
const POS_NOISE = [/\b\d{4,}[xX*]+\d*\b/g, /\b\d{1,2}\s?[A-Z]{3}\s?\d\s?\d?\b/gi, /\b\d{1,2}:\d{2}(:\d{2})?\b/g, /\b\d{5,}\b/g]
export function narrationInfo(n) {
  const s = String(n || '').replace(/\s+/g, ' ').trim()
  const up = s.toUpperCase()
  // the name is read from the narration without long reference numbers, which a wrapped line can leave in the middle of it
  const clean = s.replace(/\b[A-Za-z]*\d{6,}[A-Za-z0-9]*\b/g, ' ')
  const segs = clean.split(/\s*\/\s*|\s*-\s+|\s+-\s*|-(?=\S)/).map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const vpa = (s.match(/[\w.+]+@[a-z][a-z.]*/i) || [])[0] || ''
  // the first segment that reads like a name: letters, not a reference / bank code / VPA / remark
  const nameSeg = list => list.find(x => /[a-z]{3}/i.test(x) && !x.includes('@') && !isRef(x) && !BANKY.test(x) && !REMARK.test(x))
  const tail = (list, name) => list.slice(list.indexOf(name) + 1).filter(x => x && !isRef(x) && !x.includes('@') && !BANKY.test(x)).join(' ').trim()
  const masked = (s.match(/x{4,}(\d{3,4})\b/i) || [])[1]
  let mode = 'Bank', name = '', note = ''
  if (/^DC\s+\d+\s+AUTOPAY/.test(up)) { name = 'Debit Card EMI (AutoPay)'; note = 'Standing instruction' }
  else if (/^CBDC/.test(up)) { mode = 'Bank'; name = 'Digital Rupee (CBDC)'; note = /unload/i.test(s) ? 'Moved back to the bank' : '' }
  else if (/^INTEREST (PAID|CREDIT)/.test(up)) { name = 'Savings Interest'; note = s.replace(/^INTEREST\s*/i, '') }
  else if (/^(TO TRANSFER|BY TRANSFER)?\W*UPI/.test(up)) {
    mode = 'UPI'
    const rest = segs.filter(x => !/^(to transfer|by transfer|transfer|upi)$/i.test(x))
    name = nameSeg(rest) || ''
    // paid to a bare masked account number with no name: say so
    if (!name || (masked && /^x{4,}\d{3,4}$/i.test(rest[0] || ''))) { name = masked ? `Account ••${masked}` : ''; note = rest.filter(x => REMARK.test(x)).join(' ') }
    else note = tail(rest, name)
  } else if (/^(NEFT|RTGS|IMPS)/.test(up)) {
    mode = 'NetBanking'
    const rest = segs.filter(x => !/^(neft|rtgs|imps)( cr| dr)?$/i.test(x))
    name = nameSeg(rest) || ''
    note = tail(rest, name)
  } else if (/^(ATW|ATM|NWD|CASH WDL|PCI\/ATM|EAW)/.test(up)) { mode = 'Cash'; name = 'ATM Withdrawal'; note = nameSeg(segs.slice(1)) || '' }
  else if (/^(CRV\s+)?(POS|ECOM|PUR)\b/.test(up)) {
    mode = 'Card'
    name = POS_NOISE.reduce((t, re) => t.replace(re, ' '), s.replace(/^(CRV\s+)?(POS|ECOM|PUR)\s*/i, '')).replace(/\s+/g, ' ').replace(/^[-\s]+|[-\s]+$/g, '')
    if (/^CRV/.test(up)) note = 'Refund'
  }
  else if (/^(ACH|NACH|ECS|SI )/.test(up)) { mode = 'Bank'; name = nameSeg(segs.slice(1)) || '' }
  else name = nameSeg(segs) || segs[0] || ''
  name = nice(name.replace(/\s+IN$/, '').replace(/\d{9,}.*$/, '').replace(/@.*$/, '').replace(/_+/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, 40)
  return { mode, merchant: name || 'Unknown', vpa, note: note.slice(0, 60) }
}

// the first readable words of a narration, for lines whose name could not be picked out
export function fallbackName(narration) {
  const t = String(narration || '').replace(/\b[A-Za-z]*\d{5,}[A-Za-z0-9]*\b/g, ' ').replace(/[*_/\\|:;,]+/g, ' ').replace(/\s+/g, ' ').trim()
  return t ? nice(t).slice(0, 40) : ''
}

export function statementRows(table) {
  const c = detectColumns(table)
  if (!c) throw new Error("Couldn't find the transaction table. The file needs a header row with a Date, a description (Narration / Particulars / Remarks) and Debit & Credit (or Withdrawal & Deposit) columns.")
  const rows = []
  let prevBal = null
  for (const r of table.slice(c.header + 1)) {
    const date = parseStatementDate(r[c.date])
    if (!date) continue
    let debit = c.debit >= 0 ? parseMoney(r[c.debit]) : null
    let credit = c.credit >= 0 ? parseMoney(r[c.credit]) : null
    if (c.amount >= 0 && debit == null && credit == null) {
      const a = parseMoney(r[c.amount])
      const dir = (c.type >= 0 ? r[c.type] : r[c.amount]) || ''
      const bal = c.balance >= 0 ? parseMoney(r[c.balance]) : null
      // one amount column and no Dr / Cr marker: the balance says which way the money moved
      const marked = /\b(cr|dr)\b|cr$|dr$/i.test(dir) || (c.type >= 0 && /^[cd]$/i.test(dir.trim()))
      if (a != null) {
        if (marked) { if (/cr|^\s*c\s*$|credit/i.test(dir) || isCr(r[c.amount])) credit = a; else debit = a }
        else if (bal != null && prevBal != null) { if (bal > prevBal) credit = a; else debit = a }
        else debit = a
      }
    }
    if (c.balance >= 0) { const b = parseMoney(r[c.balance]); if (b != null) prevBal = b }
    if (!(debit > 0) && !(credit > 0)) continue
    const narration = r[c.narration] || ''
    const info = narrationInfo(narration)
    const type = debit > 0 ? 'debit' : 'credit'
    const amount = debit > 0 ? debit : credit
    rows.push({
      date, type, amount, narration, merchant: info.merchant === 'Unknown' ? (fallbackName(narration) || 'Unknown') : info.merchant, mode: info.mode,
      category: canonCategory(classifyCategory(info.merchant, narration)),
      vpa: info.vpa, note: info.note, ref: c.ref >= 0 ? r[c.ref] : '', refs: refsOf(narration, c.ref >= 0 ? r[c.ref] : ''),
      balance: c.balance >= 0 ? parseMoney(r[c.balance]) : null,
      key: `${date.toISOString().slice(0, 10)}|${type}|${amount}|${c.balance >= 0 ? parseMoney(r[c.balance]) : norm(narration).slice(0, 60)}`,
    })
  }
  if (!rows.length) throw new Error('The table was found, but no dated rows with an amount were readable in it.')
  return rows
}

// ───────────────────────────── statement vs what the app already has ─────────────────────────────
//
// The bank statement is the truth. Every statement line is paired one-to-one with a saved entry (same
// direction and amount, within two days; a shared reference number or merchant name makes a pairing
// stronger, so four genuine ₹500 payments pair with their own four lines). Then:
//   matched  - the saved entry is corrected from the statement (date, name, category, reference, balance)
//   toAdd    - on the statement but not saved: added
//   extras   - saved inside the statement's period but not on the statement: SMS duplicates and echoes
//              (offered for removal; entries you typed in yourself or that belong to a loan are kept)
const dayKey = d => { const x = new Date(d); return Math.round(new Date(x.getFullYear(), x.getMonth(), x.getDate(), 12) / 86400000) }
const cents = n => Math.round(Number(n) * 100)
const tokens = s => new Set(norm(s).split(' ').filter(w => w.length >= 3 && !/^(upi|neft|imps|ach|pos|the|pvt|ltd|bank|payment|txn)$/.test(w)))
// entries that must keep their own name / category: loan postings, transfers, card bill payments
const PROTECTED = t => !!t.debtId || t.category === 'Cashback' || ['loan_payment', 'loan_received', 'transfer', 'card_payment'].includes(t.kind)

export function reconcile(rows, saved, deleted = []) {
  const ordered = [...rows].map((r, seq) => ({ ...r, seq })).sort((a, b) => a.date - b.date || a.seq - b.seq)
  const first = dayKey(ordered[0].date), last = dayKey(ordered[ordered.length - 1].date)
  // a line already imported earlier keeps its entry (so importing the same file twice changes nothing)
  const seen = {}
  for (const r of ordered) { const n = (seen[r.key] = (seen[r.key] || 0) + 1); r.stmtKey = `${r.key}#${n}` }
  // an entry stamped by an earlier import whose line is no longer in this statement (or was read differently) is free to be matched again
  const live = new Set(ordered.map(r => r.stmtKey))
  const stale = t => t.stmtKey && !live.has(t.stmtKey)
  const byKey = new Map(saved.filter(t => t.stmtKey && live.has(t.stmtKey)).map(t => [t.stmtKey, t]))
  const claimed = new Set(), pairs = new Map()
  for (const r of ordered) { const t = byKey.get(r.stmtKey); if (t) { pairs.set(r.stmtKey, t); claimed.add(t.id) } }

  const candidates = []
  for (const r of ordered) {
    if (pairs.has(r.stmtKey)) continue
    const rt = tokens(r.narration)
    for (const t of saved) {
      if (claimed.has(t.id) || (t.stmtKey && !stale(t)) || t.type !== r.type || cents(t.amount) !== cents(r.amount)) continue
      const gap = Math.abs(dayKey(t.date) - dayKey(r.date))
      const shared = [...refsOf(t.rawSMS, t.refNo)].some(x => r.refs.has(x))
      if (gap > (shared ? 4 : 2)) continue
      let score = (shared ? 10 : 0) - gap - (t._loose ? 0.5 : 0)
      for (const w of tokens(t.merchant)) if (rt.has(w)) { score += 3; break }
      candidates.push({ r, t, score })
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.r.seq - b.r.seq)
  const done = new Set()
  for (const { r, t } of candidates) {
    if (pairs.has(r.stmtKey) || claimed.has(t.id) || done.has(r.stmtKey)) continue
    pairs.set(r.stmtKey, t); claimed.add(t.id); done.add(r.stmtKey)
  }

  const matched = [], toAdd = [], skipped = []
  // each deleted entry cancels one matching statement line (same key, or same day, direction and amount)
  const gone = deleted.map(d => ({ ...d, used: false }))
  const wasDeleted = r => {
    const day = r.date.getFullYear() + '-' + String(r.date.getMonth() + 1).padStart(2, '0') + '-' + String(r.date.getDate()).padStart(2, '0')
    const hit = gone.find(d => !d.used && (d.stmtKey ? d.stmtKey === r.stmtKey : d.day === day && d.type === r.type && cents(d.amount) === cents(r.amount)))
    if (hit) hit.used = true
    return !!hit
  }
  for (const r of ordered) { const t = pairs.get(r.stmtKey); if (t) matched.push({ row: r, txn: t }); else if (wasDeleted(r)) skipped.push(r); else toAdd.push(r) }
  const extras = saved.filter(t => !claimed.has(t.id) && (!t.stmtKey || stale(t)) && dayKey(t.date) >= first && dayKey(t.date) <= last)
    .map(t => ({ txn: t, keep: t.parsedBy === 'manual' || t.userEdited || PROTECTED(t), duplicateOf: matched.find(m => m.txn.type === t.type && cents(m.txn.amount) === cents(t.amount) && Math.abs(dayKey(m.txn.date) - dayKey(t.date)) <= 2)?.txn.id ?? null }))
    .filter(x => !x.txn._loose || x.duplicateOf != null)
  const closing = [...ordered].reverse().find(r => r.balance != null)
  return { total: ordered.length, sample: ordered.slice(0, 4).map(r => ({ date: r.date, merchant: r.merchant, amount: r.amount, type: r.type, narration: r.narration })), unnamed: ordered.filter(r => r.merchant === 'Unknown').length, matched, toAdd, skipped, extras, closingBalance: closing ? closing.balance : null, from: ordered[0].date, to: ordered[ordered.length - 1].date }
}

// what to change on a saved entry so it agrees with the statement line
export function correction(row, txn) {
  const old = new Date(txn.date)
  const date = new Date(row.date.getFullYear(), row.date.getMonth(), row.date.getDate(), old.getHours() || 12, old.getMinutes(), old.getSeconds())
  const fields = { date, stmtKey: row.stmtKey, bankNarration: row.narration, refNo: row.ref || [...row.refs][0] || txn.refNo || null, stmtBalance: row.balance, counterparty: row.merchant !== 'Unknown' ? row.merchant : null, vpa: row.vpa || null, parsedBy: txn.parsedBy === 'manual' ? 'manual' : 'statement' }
  // what you set yourself wins: all of it for an entry you added by hand, only the changed fields for one you edited.
  // A name that is still blank / Unknown / NA was never set by you, so the statement can always fill it in.
  const mine = txn.parsedBy === 'manual' ? ['merchant', 'category', 'notes', 'date'] : (txn.userEdited ? (txn.editedFields || ['merchant', 'category', 'notes']) : [])
  const unnamed = !txn.merchant || /^(unknown|na|n\/a|-+)$/i.test(String(txn.merchant).trim())
  fields.parsedBy = txn.parsedBy === 'manual' ? 'manual' : (txn.userEdited ? txn.parsedBy : 'statement')
  if (mine.includes('date')) delete fields.date
  if (!txn.notes && row.note && !mine.includes('notes')) fields.notes = row.note
  if (unnamed && row.merchant && row.merchant !== 'Unknown') fields.merchant = row.merchant // never leave a nameless entry nameless
  if (!PROTECTED(txn) && txn.parsedBy !== 'manual') {
    if (row.merchant && row.merchant !== 'Unknown' && (!mine.includes('merchant') || unnamed)) fields.merchant = row.merchant
    if ((!txn.category || ['General', 'Other', 'Unknown'].includes(txn.category)) && !mine.includes('category')) fields.category = row.category
  }
  return fields
}

export function newEntry(row, accountId, account) {
  const isCard = account && account.cardType !== 'account'
  // on a credit card statement a credit is either the bill being paid (not income) or a refund / cashback
  const billPaid = isCard && row.type === 'credit' && /(payment|paid|received|thank you|bbps|neft|imps|upi)/i.test(row.narration) && !/(refund|reversal|cashback)/i.test(row.narration)
  const cardBill = !isCard && /\b(cred|cc payment|credit card|cardpay|card bill)\b/i.test(row.narration)
  return {
    date: row.date, amount: row.amount, type: row.type, merchant: billPaid ? 'Card payment' : row.merchant,
    category: billPaid || cardBill ? 'Card Payment' : row.category,
    paymentMode: isCard ? 'Credit Card' : row.mode, bank: account?.bank || '', accountLast4: account?.cardLast4 || null, cardId: accountId, rawSMS: null,
    parsedBy: 'statement', counterparty: row.merchant !== 'Unknown' ? row.merchant : null, vpa: row.vpa || null, stmtKey: row.stmtKey, bankNarration: row.narration, refNo: row.ref || [...row.refs][0] || null, stmtBalance: row.balance,
    ...(billPaid ? { kind: 'card_payment' } : {}),
    tags: [], notes: row.note || '', isExcluded: billPaid || cardBill, createdAt: new Date(),
  }
}

// File or pasted text -> statement rows
export async function readStatement({ file, text, password }) {
  let table
  if (file) {
    const head = new Uint8Array(await file.slice(0, 8).arrayBuffer())
    const isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf' || String.fromCharCode(...head.slice(0, 4)) === '%PDF'
    const isOle = head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0 // old .xls, or an encrypted .xlsx
    if (isPdf) table = await (await import('./statementPdf')).parsePdf(await file.arrayBuffer(), password)
    else if (isOle) throw new Error('This Excel file is old-format or password-protected, which cannot be read here. Open it in Excel, enter the password, use Save As → CSV (or .xlsx without a password), then import that. Or import the bank\'s PDF, which can be opened with its password here.')
    else if (/\.xlsx$/i.test(file.name) || file.type.includes('spreadsheetml')) table = await parseXlsx(await file.arrayBuffer())
    else table = parseDelimited(await file.text())
  } else table = parseDelimited(text)
  return statementRows(table)
}
