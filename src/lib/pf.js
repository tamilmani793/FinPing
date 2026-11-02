import { db } from '../db/schema'
import { openPdf, toLines } from './payslipParser'
import { fyStartYear } from './salary'

// Provident fund. The amounts are never typed in: the employee share is the PF deducted on each payslip, the employer share follows from the
// percentages, and the interest follows from the rate of each financial year. You can only change the PERCENTAGES.
//
//   Employee  e% of PF wages  -> all into the EPF account
//   Employer  r% of PF wages  -> a pension part (p%, on wages up to the ₹15,000 ceiling) goes to the pension fund (EPS),
//                                the rest (r% - p%) goes into the EPF account
//   Interest  a yearly rate on the EPF balance, worked out month by month and credited at the end of the financial year (31 March).
//             The pension fund earns no interest.
// Figures read from an EPF passbook replace the computed ones for the months, years and balance they cover.

export const WAGE_CEILING = 15000
export const DEFAULT_SETTINGS = { employeePct: 12, employerPct: 12, pensionPct: 8.33, pensionCap: true }
// the rate EPFO declared for each financial year (the year it started); later years default to the newest. Editable on the page.
export const DEFAULT_RATES = { 2016: 8.65, 2017: 8.55, 2018: 8.65, 2019: 8.5, 2020: 8.5, 2021: 8.1, 2022: 8.15, 2023: 8.25, 2024: 8.25 }
export const NEWEST_DEFAULT = 8.25

const r2 = x => Math.round(x * 100) / 100
const num = v => Number(v) || 0
export const rateFor = (fy, saved = {}) => (saved[fy] != null ? Number(saved[fy]) : DEFAULT_RATES[fy] ?? NEWEST_DEFAULT)
const pad = n => String(n).padStart(2, '0')
const nextMonth = m => { const [y, mo] = m.split('-').map(Number); return mo === 12 ? `${y + 1}-01` : `${y}-${pad(mo + 1)}` }
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

export async function loadPfInputs() {
  const [rows, rates, statements, records, jobs] = await Promise.all([db.pf_settings.toArray(), db.pf_rates.toArray(), db.pf_statements.toArray(), db.salaryRecords.toArray(), db.salaryJobs.toArray()])
  // each employer has its own split (TCS paid no pension, Accenture does); a row without a jobId is the default for the rest
  const base = { ...DEFAULT_SETTINGS, ...(rows.find(r => r.jobId == null) || {}) }
  const byJob = Object.fromEntries(jobs.map(j => [j.id, { ...base, ...(rows.find(r => r.jobId === j.id) || {}) }]))
  return { base, byJob, rates: Object.fromEntries(rates.map(r => [r.fy, r.rate])), statements, records, jobs }
}
export async function saveSettings(jobId, patch, current = DEFAULT_SETTINGS) {
  const cur = (await db.pf_settings.toArray()).find(r => (r.jobId ?? null) === (jobId ?? null))
  if (cur) await db.pf_settings.update(cur.id, patch); else await db.pf_settings.add({ ...current, ...patch, jobId })
}
export async function saveRate(fy, rate) {
  if (rate === '' || rate == null) await db.pf_rates.delete(fy); else await db.pf_rates.put({ fy, rate: Number(rate) })
}

// one month's contribution from a payslip (or from the passbook when it has that month)
export function monthShare(pfDeducted, s) {
  const ee = num(pfDeducted)
  const wage = s.employeePct > 0 ? ee / (s.employeePct / 100) : 0
  const employer = wage * (s.employerPct / 100)
  const pensionWage = s.pensionCap ? Math.min(wage, WAGE_CEILING) : wage
  const eps = Math.min(employer, Math.round(pensionWage * (s.pensionPct / 100))) // EPFO rounds the pension share to the rupee (8.33% of ₹15,000 = ₹1,250)
  return { wage: r2(wage), ee: r2(ee), employer: r2(employer), eps: r2(eps), er: r2(employer - eps) }
}

export function buildPf({ records = [], statements = [], base = DEFAULT_SETTINGS, byJob = {}, rates = {} }) {
  const s = { ...DEFAULT_SETTINGS, ...base }
  const stContrib = new Map(statements.filter(x => x.kind === 'contribution').map(x => [x.month, x]))
  const stInterest = new Map(statements.filter(x => x.kind === 'interest').map(x => [x.fy, x]))
  const balance = statements.filter(x => x.kind === 'balance').sort((a, b) => cmp(b.asOf, a.asOf))[0] || null

  // contributions by month: the passbook where it has the month, else the payslip (several payslips in a month add up)
  const by = new Map()
  for (const r of records) {
    if (!(num(r.pf) > 0)) continue
    const m = by.get(r.month) || { month: r.month, ee: 0, er: 0, eps: 0, wage: 0, source: 'payslip' }
    const x = monthShare(r.pf, { ...s, ...(byJob[r.jobId] || {}) })
    m.ee += x.ee; m.er += x.er; m.eps += x.eps; m.wage += x.wage
    by.set(r.month, m)
  }
  for (const [month, st] of stContrib) by.set(month, { month, ee: num(st.ee), er: num(st.er), eps: num(st.eps), wage: num(st.wageEpf), source: 'statement' })
  const months = [...by.values()].sort((a, b) => cmp(a.month, b.month)).map(m => ({ ...m, ee: r2(m.ee), er: r2(m.er), eps: r2(m.eps), wage: r2(m.wage), fy: fyStartYear(m.month) }))
  if (!months.length && !balance) return { empty: true, settings: s, sections: [], months: [] }

  // the balance, month by month from the passbook balance (or from the first contribution)
  const asOfMonth = balance ? balance.asOf.slice(0, 7) : null
  const first = asOfMonth ? nextMonth(asOfMonth) : months[0]?.month
  const last = months.length ? months[months.length - 1].month : first
  let eeBal = balance ? num(balance.ee) : 0
  let erBal = balance ? num(balance.er) : 0
  let pension = balance ? num(balance.eps) : 0
  const sections = new Map()
  const section = fy => {
    if (!sections.has(fy)) sections.set(fy, { fy, rate: rateFor(fy, rates), customRate: rates[fy] != null, months: [], ee: 0, er: 0, eps: 0, accruedEe: 0, accruedEr: 0, openingEpf: 0, closingEpf: 0, pensionClosing: 0, credited: null })
    return sections.get(fy)
  }
  for (const m of months) section(m.fy).months.push(m)
  const byMonth = new Map(months.map(m => [m.month, m]))
  const lastFy = months.length ? Math.max(...months.map(m => m.fy)) : fyStartYear(first)

  if (first && last && first <= last) {
    let cur = first, openingSet = new Set()
    for (let guard = 0; cur <= last && guard < 600; guard++, cur = nextMonth(cur)) {
      const fy = fyStartYear(cur), sec = section(fy)
      if (!openingSet.has(fy)) { openingSet.add(fy); sec.openingEpf = r2(eeBal + erBal) }
      const rate = sec.rate
      // interest is worked out on the balance before this month's contribution
      sec.accruedEe += eeBal * rate / 1200
      sec.accruedEr += erBal * rate / 1200
      const c = byMonth.get(cur)
      if (c) { eeBal += c.ee; erBal += c.er; pension += c.eps }
      if (cur.endsWith('-03')) { // year end: the interest is credited
        const actual = stInterest.get(fy)
        const addEe = actual ? num(actual.ee) : sec.accruedEe, addEr = actual ? num(actual.er) : sec.accruedEr
        sec.credited = { ee: r2(addEe), er: r2(addEr), total: r2(addEe + addEr), source: actual ? 'statement' : 'estimate' }
        eeBal += addEe; erBal += addEr
      }
      sec.closingEpf = r2(eeBal + erBal); sec.pensionClosing = r2(pension)
    }
  }
  const list = [...sections.values()].sort((a, b) => b.fy - a.fy).map(sec => ({
    ...sec, ee: r2(sec.months.reduce((t, m) => t + m.ee, 0)), er: r2(sec.months.reduce((t, m) => t + m.er, 0)), eps: r2(sec.months.reduce((t, m) => t + m.eps, 0)), accrued: r2(sec.accruedEe + sec.accruedEr),
    inProgress: !sec.credited && sec.fy === lastFy, // the year is still running: interest so far, credited on 31 March
  }))
  const interestEarned = r2(list.reduce((t, x) => t + (x.credited ? x.credited.total : 0), 0))
  const accruing = list.find(x => !x.credited && x.accrued > 0)
  return {
    empty: false, settings: s, months, sections: list, balanceFrom: balance,
    eeBalance: r2(eeBal), erBalance: r2(erBal), epfBalance: r2(eeBal + erBal), pensionBalance: r2(pension),
    interestEarned, accrued: accruing ? accruing.accrued : 0, accruedFy: accruing?.fy ?? null,
    totalEe: r2(months.reduce((t, m) => t + m.ee, 0)), totalEr: r2(months.reduce((t, m) => t + m.er, 0)), totalEps: r2(months.reduce((t, m) => t + m.eps, 0)),
    estimated: !balance, // no passbook balance: counted from the first payslip, so earlier years are not included
  }
}

// ── contributions pasted from the EPFO member portal ──
// "1  AUG-2026  ₹4095  ₹2845  ₹1250  <member id>": wage month, employee, employer (PF part), pension. A pension of 0 or missing means the employer paid none.
export function parsePastedContributions(text) {
  const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }
  const out = new Map()
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = line.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[-\s/]+(\d{4})\b\s*(.*)$/i)
    if (!m) continue
    const n = (m[3].match(/\d[\d,]*(?:\.\d+)?/g) || []).map(x => Number(x.replace(/,/g, '')))
    // keep the three amounts that come straight after the month; the member id (a long number) is ignored
    const [ee, er, eps = 0] = n
    if (!(ee > 0) || er == null || n.slice(0, 3).some(v => v > 10000000)) continue
    const key = `${m[2]}-${String(MON[m[1].toLowerCase()]).padStart(2, '0')}`
    const o = out.get(key) || { kind: 'contribution', month: key, wageEpf: 0, wageEps: 0, ee: 0, er: 0, eps: 0 }
    o.ee += ee; o.er += er; o.eps += eps
    out.set(key, o)
  }
  const contributions = [...out.values()].sort((a, b) => cmp(a.month, b.month))
  if (!contributions.length) throw new Error('No contribution rows found. Paste the table from the EPFO member portal (wage month, employee, employer, pension).')
  return { contributions, interest: [], balance: null }
}

// ── EPF passbook ──
// Rows are found by their wording, not their position:
//   "Cont. For Due-Month 102023 ... wages EPF, wages EPS, employee share, employer share, pension share"
//   "Int. Updated upto 31/03/2024 ... employee interest, employer interest"
//   "Closing Balance as on 31/03/2024 ... employee balance, employer balance, pension balance"
const NUMS = /\d[\d,]*(?:\.\d+)?/g
const nums = s => (String(s).match(NUMS) || []).map(x => Number(x.replace(/,/g, '')))
const dateOf = (d, m, y) => `${y}-${pad(m)}-${pad(d)}`

export async function parsePassbookPdf(arrayBuffer, password) {
  const { doc, task } = await openPdf(arrayBuffer, password)
  const lines = []
  for (let p = 1; p <= doc.numPages; p++) { const tc = await (await doc.getPage(p)).getTextContent(); for (const l of toLines(tc.items)) lines.push(l.cells.map(c => c.s).join(' ')) }
  await task.destroy()
  if (!lines.length) throw new Error('This PDF has no readable text (it may be a scanned image).')
  const contrib = new Map(), interest = new Map(), balances = []
  for (const line of lines) {
    let m = line.match(/Cont(?:\.|ribution)?\s*for\s*Due[-\s]*Month\s*(\d{2})[-/\s]?(\d{4})(.*)$/i)
    if (m) {
      const n = nums(m[3])
      if (n.length >= 5) {
        const [wageEpf, wageEps, ee, er, eps] = n.slice(-5)
        const key = `${m[2]}-${m[1]}`
        const o = contrib.get(key) || { kind: 'contribution', month: key, wageEpf: 0, wageEps: 0, ee: 0, er: 0, eps: 0 }
        o.wageEpf = Math.max(o.wageEpf, wageEpf); o.wageEps = Math.max(o.wageEps, wageEps); o.ee += ee; o.er += er; o.eps += eps
        contrib.set(key, o)
      }
      continue
    }
    m = line.match(/Int(?:\.|erest)?\s*Updated\s*upto\s*(\d{1,2})[/-](\d{1,2})[/-](\d{4})(.*)$/i)
    if (m) {
      const n = nums(m[4])
      if (n.length >= 2) { const fy = Number(m[3]) - (Number(m[2]) < 4 ? 1 : 0); interest.set(fy, { kind: 'interest', fy, ee: n[0], er: n[1], total: r2(n[0] + n[1]) }) }
      continue
    }
    m = line.match(/Closing\s*Balance\s*as\s*on\s*(\d{1,2})[/-](\d{1,2})[/-](\d{4})(.*)$/i)
    if (m) { const n = nums(m[4]); if (n.length >= 2) balances.push({ kind: 'balance', asOf: dateOf(m[1], m[2], m[3]), ee: n[0], er: n[1], eps: n[2] ?? 0 }) }
  }
  const out = { contributions: [...contrib.values()].sort((a, b) => cmp(a.month, b.month)), interest: [...interest.values()].sort((a, b) => a.fy - b.fy), balance: balances.sort((a, b) => cmp(b.asOf, a.asOf))[0] || null }
  if (!out.contributions.length && !out.interest.length && !out.balance) throw new Error('No EPF passbook rows were found in this PDF. Use the member passbook downloaded from the EPFO member portal.')
  return out
}

// keeps the figures read from a passbook (a month, year or balance already saved is replaced)
export async function savePassbook(p) {
  const rows = [...p.contributions, ...p.interest, ...(p.balance ? [p.balance] : [])]
  await db.transaction('rw', db.pf_statements, async () => {
    for (const r of rows) {
      const old = await db.pf_statements.where('kind').equals(r.kind).filter(x => (r.kind === 'contribution' ? x.month === r.month : r.kind === 'interest' ? x.fy === r.fy : x.asOf === r.asOf)).toArray()
      for (const o of old) await db.pf_statements.delete(o.id)
      await db.pf_statements.add({ ...r, addedAt: new Date() })
    }
  })
  return rows.length
}
export const clearPassbooks = () => db.pf_statements.clear()
