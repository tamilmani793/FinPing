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
  // a balance dated in the future (the passbook prints its running balance against the coming 31 March) is not an anchor: it would hide this year's interest
  const todayIso = new Date().toISOString().slice(0, 10)
  const balance = statements.filter(x => x.kind === 'balance' && !(x.asOf > todayIso)).sort((a, b) => cmp(b.asOf, a.asOf))[0] || null

  // contributions by month: the passbook where it has the month, else the payslip (several payslips in a month add up)
  const by = new Map()
  for (const r of records) {
    if (!(num(r.pf) > 0)) continue
    const m = by.get(r.month) || { month: r.month, ee: 0, er: 0, eps: 0, wage: 0, source: 'payslip' }
    const x = monthShare(r.pf, { ...s, ...(byJob[r.jobId] || {}) })
    m.ee += x.ee; m.er += x.er; m.eps += x.eps; m.wage += x.wage
    by.set(r.month, m)
  }
  for (const [month, st] of stContrib) {
    let ee = num(st.ee), er = num(st.er), transfer = null
    // a passbook line far above one month's share is the old employer's PF account moved in (it holds the earlier contributions and their interest, which the
    // payslips already count): only the usual month's share is a contribution, the rest is carried in as balance
    const p = by.get(month)
    const expected = p ? p.ee : num(st.wageEpf) > 0 ? num(st.wageEpf) * s.employeePct / 100 : 0
    if (expected > 0 && ee > expected * 3 && ee > 20000) {
      const erReg = r2(er * expected / ee)
      transfer = { ee: r2(ee - expected), er: r2(er - erReg) }
      ee = r2(expected); er = erReg
    }
    by.set(month, { month, ee, er, eps: num(st.eps), wage: num(st.wageEpf), source: 'statement', transfer })
  }
  const months = [...by.values()].sort((a, b) => cmp(a.month, b.month)).map(m => ({ ...m, ee: r2(m.ee), er: r2(m.er), eps: r2(m.eps), wage: r2(m.wage), fy: fyStartYear(m.month) }))
  if (!months.length && !balance) return { empty: true, settings: s, sections: [], months: [] }

  // the balance, month by month from the passbook balance (or from the first contribution)
  const asOfMonth = balance ? balance.asOf.slice(0, 7) : null
  const first = balance ? (balance.from || nextMonth(asOfMonth)) : months[0]?.month // the first month NOT in the balance
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
      // a passbook balance already holds the interest credited up to its date: that year's interest is not worked out or added again
      const inBalance = !!balance && `${fy + 1}-03-31` <= balance.asOf
      // interest is worked out on the balance before this month's contribution
      if (!inBalance) { sec.accruedEe += eeBal * rate / 1200; sec.accruedEr += erBal * rate / 1200 }
      const c = byMonth.get(cur)
      if (c) { eeBal += c.ee; erBal += c.er; pension += c.eps }
      if (cur.endsWith('-03')) { // year end: the interest is credited
        const actual = stInterest.get(fy)
        if (inBalance) {
          if (actual) sec.credited = { ee: r2(num(actual.ee)), er: r2(num(actual.er)), total: r2(num(actual.ee) + num(actual.er)), source: 'statement' }
          else sec.inBalance = true
        } else {
          const addEe = actual ? num(actual.ee) : sec.accruedEe, addEr = actual ? num(actual.er) : sec.accruedEr
          sec.credited = { ee: r2(addEe), er: r2(addEr), total: r2(addEe + addEr), source: actual ? 'statement' : 'estimate' }
          eeBal += addEe; erBal += addEr
        }
      }
      sec.closingEpf = r2(eeBal + erBal); sec.closingEe = r2(eeBal); sec.closingEr = r2(erBal); sec.pensionClosing = r2(pension)
    }
  }
  // interest the passbook shows for a year the month-by-month run never reached (the year ends before the balance it starts from)
  for (const [fy, actual] of stInterest) {
    const total = num(actual.ee) + num(actual.er)
    if (!(total > 0)) continue
    const sec = section(fy)
    if (!sec.credited) sec.credited = { ee: r2(num(actual.ee)), er: r2(num(actual.er)), total: r2(total), source: 'statement' }
  }
  // the years before the passbook balance: its opening figure already holds their interest, so work each year out again from the first contribution
  // (a passbook year keeps its real figure) to show what was earned in it. These are estimates and do not feed the balance.
  if (balance && months.length && months[0].month <= asOfMonth) {
    let e = 0, r = 0, acc = { ee: 0, er: 0 }
    for (let cur = months[0].month, guard = 0; cur <= asOfMonth && guard < 600; guard++, cur = nextMonth(cur)) {
      const fy = fyStartYear(cur), rate = rateFor(fy, rates)
      if (cur.endsWith('-04') || cur === months[0].month) acc = { ee: 0, er: 0 }
      acc.ee += e * rate / 1200; acc.er += r * rate / 1200
      const c = byMonth.get(cur)
      if (c) { e += c.ee; r += c.er }
      if (cur.endsWith('-03')) {
        const actual = stInterest.get(fy)
        const addEe = actual ? num(actual.ee) : acc.ee, addEr = actual ? num(actual.er) : acc.er
        e += addEe; r += addEr
        const sec = section(fy)
        if (!actual && !sec.credited && addEe + addEr > 0) sec.credited = { ee: r2(addEe), er: r2(addEr), total: r2(addEe + addEr), source: 'estimate' }
      }
    }
  }
  const list = [...sections.values()].sort((a, b) => b.fy - a.fy).map(sec => ({
    ...sec, ee: r2(sec.months.reduce((t, m) => t + m.ee, 0)), er: r2(sec.months.reduce((t, m) => t + m.er, 0)), eps: r2(sec.months.reduce((t, m) => t + m.eps, 0)), accrued: r2(sec.accruedEe + sec.accruedEr),
    inProgress: !sec.credited && sec.fy === lastFy, // the year is still running: interest so far, credited on 31 March
  }))
  const interestEarned = r2(list.reduce((t, x) => t + (x.credited ? x.credited.total : 0), 0))
  const accruing = list.find(x => !x.credited && x.accrued > 0)
  // where the balance came from: what you and the employer put in (every month known here) and the rest, which is interest
  const sumEe = r2(months.reduce((t, m) => t + m.ee, 0)), sumEr = r2(months.reduce((t, m) => t + m.er, 0))
  const split = { eeContrib: sumEe, erContrib: sumEr, interest: r2(eeBal + erBal - sumEe - sumEr), interestEe: r2(eeBal - sumEe), interestEr: r2(erBal - sumEr), since: months[0]?.month || null }
  // the two halves of the picture: everything up to the end of last financial year, and this year on top of it (interest expected at 31 March)
  let summary = null
  if (balance && months.length) {
    const curFy = lastFy
    const prevSec = list.find(x => x.fy === curFy - 1)
    const prev = `${curFy}-03-31` === balance.asOf ? { ee: num(balance.ee), er: num(balance.er) } : prevSec && prevSec.closingEe != null ? { ee: prevSec.closingEe, er: prevSec.closingEr } : null
    const curSec = list.find(x => x.fy === curFy)
    const before = months.filter(m => m.fy < curFy)
    const pEe = r2(before.reduce((t, m) => t + m.ee, 0)), pEr = r2(before.reduce((t, m) => t + m.er, 0))
    let cur = null
    if (curSec && !curSec.credited) {
      // the rest of the year: the latest month's contribution repeats, interest runs on the balance before each month's contribution
      const lastM = months[months.length - 1]
      let e = eeBal, r = erBal, aE = curSec.accruedEe, aR = curSec.accruedEr, remEe = 0, remEr = 0
      for (let m = nextMonth(last), g = 0; m <= `${curFy + 1}-03` && g < 24; m = nextMonth(m), g++) {
        aE += e * curSec.rate / 1200; aR += r * curSec.rate / 1200
        e += lastM.ee; r += lastM.er; remEe += lastM.ee; remEr += lastM.er
      }
      cur = { ee: curSec.ee, er: curSec.er, accruedSoFar: r2(curSec.accruedEe + curSec.accruedEr), expectedInterest: r2(aE + aR), expectedInterestEe: r2(aE), expectedInterestEr: r2(aR), remainingEe: r2(remEe), remainingEr: r2(remEr), rate: curSec.rate }
    }
    summary = {
      fy: curFy,
      prev: prev ? { ee: r2(prev.ee), er: r2(prev.er), total: r2(prev.ee + prev.er), paidEe: pEe, paidEr: pEr, interest: r2(prev.ee + prev.er - pEe - pEr), interestEe: r2(prev.ee - pEe), interestEr: r2(prev.er - pEr) } : null,
      cur,
    }
  }
  return {
    summary, empty: false, settings: s, months, sections: list, balanceFrom: balance,
    eeBalance: r2(eeBal), erBalance: r2(erBal), epfBalance: r2(eeBal + erBal), pensionBalance: r2(pension),
    interestEarned, accrued: accruing ? accruing.accrued : 0, accruedFy: accruing?.fy ?? null,
    accruedEe: accruing ? r2(accruing.accruedEe) : 0, accruedEr: accruing ? r2(accruing.accruedEr) : 0,
    totalEe: r2(months.reduce((t, m) => t + m.ee, 0)), totalEr: r2(months.reduce((t, m) => t + m.er, 0)), totalEps: r2(months.reduce((t, m) => t + m.eps, 0)),
    split,
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
// Rows are found by their wording, not their position. The EPFO member passbook prints, for a financial year:
//   "OB Int. Updated upto 01/04/2026   2,63,551  1,18,101  70,134"   the opening balance: employee, employer, pension
//   "Mar-2026 01-04-2026  CR  34,125  15,000  4,095  2,845  1,250"   wage month, date credited, wages (EPF, EPS), employee, employer (PF part), pension
//   "Int. Updated upto 31/03/2026  ..."                              interest credited for a year (employee, employer)
//   "Closing Balance as on 31/03/2027  2,88,121  1,35,171  77,634"   employee, employer, pension balance
// Older passbooks print the contribution as "Cont. For Due-Month 102023 ..." (the month it was credited, one after the wage month).
// Months are kept by WAGE month, the same month a payslip is for.
const NUMS = /\d[\d,]*(?:\.\d+)?/g
const nums = s => (String(s).match(NUMS) || []).map(x => Number(x.replace(/,/g, '')))
const dateOf = (d, m, y) => `${y}-${pad(m)}-${pad(d)}`
const prevMonth = m => { const [y, mo] = m.split('-').map(Number); return mo === 1 ? `${y - 1}-12` : `${y}-${pad(mo - 1)}` }
const dayBefore = iso => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() - 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }

// the text lines of a passbook -> what to save. Separate from the PDF reading so it can be checked on its own.
export function parsePassbookLines(lines, now = new Date()) {
  const todayIso = dateOf(now.getDate(), now.getMonth() + 1, now.getFullYear())
  const contrib = new Map(), interest = new Map(), balances = []
  let opening = null, printed = null, totals = null, member = ''
  for (const line of lines) {
    let m = line.match(/Member\s*ID\s*\/\s*Name\s*([A-Z0-9]{10,})/i)
    if (m) { member = m[1]; continue }
    // the opening balance of the year: it is the balance just before the first contribution listed below it
    m = line.match(/^\s*OB\b.*?Updated\s*upto\s*(\d{1,2})[/-](\d{1,2})[/-](\d{4})(.*)$/i)
    if (m) { const n = nums(m[4]); if (n.length >= 2) opening = { date: dateOf(m[1], m[2], m[3]), ee: n[0], er: n[1], eps: n[2] ?? 0 }; continue }
    // a month's contribution, as the passbook prints it today
    m = line.match(/^\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[-\s](\d{4})\s+(\d{1,2})[-/](\d{1,2})[-/](\d{4})\s*(CR|DR)?\s*(.*)$/i)
    if (m) {
      const n = nums(m[7])
      if (!/^dr$/i.test(m[6] || '') && n.length >= 5) {
        const [wageEpf, wageEps, ee, er, eps] = n.slice(-5)
        const key = `${m[2]}-${pad(MON[m[1].toLowerCase()])}`
        const o = contrib.get(key) || { kind: 'contribution', month: key, wageEpf: 0, wageEps: 0, ee: 0, er: 0, eps: 0, credited: dateOf(m[3], m[4], m[5]) }
        o.wageEpf = Math.max(o.wageEpf, wageEpf); o.wageEps = Math.max(o.wageEps, wageEps); o.ee += ee; o.er += er; o.eps += eps
        contrib.set(key, o)
      }
      continue
    }
    // the older layout: the month it was credited (one after the wage month)
    m = line.match(/Cont(?:\.|ribution)?\s*for\s*Due[-\s]*Month\s*(\d{2})[-/\s]?(\d{4})(.*)$/i)
    if (m) {
      const n = nums(m[3])
      if (n.length >= 5) {
        const [wageEpf, wageEps, ee, er, eps] = n.slice(-5)
        const key = prevMonth(`${m[2]}-${m[1]}`)
        const o = contrib.get(key) || { kind: 'contribution', month: key, wageEpf: 0, wageEps: 0, ee: 0, er: 0, eps: 0 }
        o.wageEpf = Math.max(o.wageEpf, wageEpf); o.wageEps = Math.max(o.wageEps, wageEps); o.ee += ee; o.er += er; o.eps += eps
        contrib.set(key, o)
      }
      continue
    }
    m = line.match(/Total\s*Contributions\s*for\s*the\s*year(.*)$/i)
    if (m) { const n = nums(m[1].replace(/\[[^\]]*\]/g, '')); if (n.length >= 3) totals = { ee: n[0], er: n[1], eps: n[2] }; continue }
    m = line.match(/Int(?:\.|erest)?\s*Updated\s*upto\s*(\d{1,2})[/-](\d{1,2})[/-](\d{4})(.*)$/i)
    if (m) {
      const n = nums(m[4])
      const iso = dateOf(m[1], m[2], m[3])
      // interest not credited yet shows as zeros against the coming 31 March: not a figure
      if (n.length >= 2 && !(n[0] + n[1] === 0 && iso > todayIso)) { const fy = Number(m[3]) - (Number(m[2]) < 4 ? 1 : 0); interest.set(fy, { kind: 'interest', fy, ee: n[0], er: n[1], total: r2(n[0] + n[1]) }) }
      continue
    }
    m = line.match(/Closing\s*Balance\s*as\s*on\s*(\d{1,2})[/-](\d{1,2})[/-](\d{4})(.*)$/i)
    if (m) {
      const n = nums(m[4]); const asOf = dateOf(m[1], m[2], m[3])
      if (n.length >= 2) { const b = { kind: 'balance', asOf, from: asOf.slice(0, 7), ee: n[0], er: n[1], eps: n[2] ?? 0 }; if (asOf <= todayIso) balances.push(b); else printed = b }
    }
  }
  const contributions = [...contrib.values()].sort((a, b) => cmp(a.month, b.month))
  // the opening balance is the anchor: everything from the first listed month onward is added to it
  let balance = balances.sort((a, b) => cmp(b.asOf, a.asOf))[0] || null
  if (opening) balance = { kind: 'balance', asOf: dayBefore(opening.date), from: contributions[0]?.month || opening.date.slice(0, 7), ee: opening.ee, er: opening.er, eps: opening.eps, opening: true }
  // the passbook's own closing figure against opening + the listed months (this year's interest is not credited yet): proof the rows were read completely
  let check = null
  if (opening && printed) {
    const sum = k => r2(contributions.reduce((t, c) => t + c[k], 0))
    const expected = { ee: r2(opening.ee + sum('ee')), er: r2(opening.er + sum('er')), eps: r2(opening.eps + sum('eps')) }
    const interestAdded = interest.get(Number(printed.asOf.slice(0, 4)) - 1)
    check = { printed: { ee: printed.ee, er: printed.er, eps: printed.eps }, expected, ok: !interestAdded && Math.abs(expected.ee - printed.ee) < 1 && Math.abs(expected.er - printed.er) < 1 && Math.abs(expected.eps - printed.eps) < 1, totalsOk: totals ? Math.abs(sum('ee') - totals.ee) < 1 && Math.abs(sum('er') - totals.er) < 1 : null }
  }
  return { contributions, interest: [...interest.values()].sort((a, b) => a.fy - b.fy), balance, check, member }
}

export async function parsePassbookPdf(arrayBuffer, password) {
  const { doc, task } = await openPdf(arrayBuffer, password)
  const lines = []
  for (let p = 1; p <= doc.numPages; p++) { const tc = await (await doc.getPage(p)).getTextContent(); for (const l of toLines(tc.items)) lines.push(l.cells.map(c => c.s).join(' ')) }
  await task.destroy()
  if (!lines.length) throw new Error('This PDF has no readable text (it may be a scanned image).')
  const out = parsePassbookLines(lines)
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

// ── EPS pension projection ──
// EPS pays a monthly pension of (pensionable salary x years of service) / 70 from age 58, after 10 years of service. Pensionable salary is the average of the
// last 60 months' wage, held at the ₹15,000 ceiling. Taken from 50 to 57 it is cut 4% for each year before 58; left until 59 or 60 it grows 4% a year.
// the pension for a member of `age` who keeps working until `endAge` and starts the pension at `startAge` (58 normally; 50 to 57 early, 59 or 60 later)
export function epsPension(pf, age, endAge, startAge) {
  if (!pf || pf.empty) return null
  // with a passbook, pension service starts where the passbook's pension starts (earlier payslip months may belong to an employer that paid none)
  const stFirst = pf.months.find(m => m.source === 'statement' && m.eps > 0)
  const worked = pf.months.filter(m => m.eps > 0 && (!stFirst || m.month >= stFirst.month))
  if (!worked.length) return null
  const lastW = worked[worked.length - 1]
  const salary = Math.min(lastW.wage > 0 ? lastW.wage : WAGE_CEILING, WAGE_CEILING)
  const left = Math.max(0, Math.round((num(endAge) - num(age)) * 12))
  const years = Math.round((worked.length + left) / 12) // 6 months or more in the last year counts as a full year
  const adj = startAge < 58 ? 1 - 0.04 * (58 - startAge) : 1 + 0.04 * (Math.min(startAge, 60) - 58)
  const pension = years >= 10 ? Math.max(1000, Math.round(salary * years / 70 * adj)) : 0
  return { pension, years, adj, salary, serviceMonths: worked.length, since: worked[0].month, monthlyEps: lastW.eps, lastMonth: lastW.month, left, balance: r2(pf.pensionBalance + lastW.eps * left), startAge }
}
export function epsProjection(pf, age) {
  const now = epsPension(pf, age, age, 58)
  if (!now) return null
  const a = num(age)
  const rows = [50, 58, 60].filter(x => x > a).map(x => {
    const r = epsPension(pf, age, x, x)
    return { age: x, years: r.years, pension: r.pension, balance: r.balance, note: x < 58 ? 'taken early, 4% less for each year before 58' : x > 58 ? 'taken later, 4% more for each year after 58' : 'the normal pension age' }
  })
  const tenOn = now.serviceMonths >= 120 ? null : (() => { let m = now.lastMonth; for (let i = now.serviceMonths; i < 120; i++) m = nextMonth(m); return m })()
  return { serviceMonths: now.serviceMonths, since: now.since, salary: now.salary, monthlyEps: now.monthlyEps, rows, tenOn }
}
