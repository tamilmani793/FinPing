import { addDays, endOfMonth, startOfMonth } from 'date-fns'
import { db } from '../db/schema'

// Salary tracking (Profile -> Salary): employers and CTC revisions, one payslip record per month, the yearly tax / PF totals, and a
// check against the salary credit in your bank account. Everything stays on this phone and goes into the backup.

export const REVISION_KINDS = [
  { value: 'joining', label: 'Joining' }, { value: 'hike', label: 'Hike' }, { value: 'promotion', label: 'Promotion' },
  { value: 'bonus', label: 'Bonus' }, { value: 'other', label: 'Other' },
]

const n = v => (v === '' || v == null ? 0 : Number(v) || 0)
export const r2 = x => Math.round(x * 100) / 100

// 'YYYY-MM' -> the Indian financial year it falls in (April to March)
// the Indian financial year (April to March) that today falls in, as the year it started
export const currentFyYear = (now = new Date()) => (now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1)
export const fyStartYear = month => { const [y, m] = month.split('-').map(Number); return m >= 4 ? y : y - 1 }
export const fyLabel = startYear => `FY ${startYear}-${String(startYear + 1).slice(2)}`
export const monthLabel = month => { const [y, m] = month.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleString('en-IN', { month: 'short', year: 'numeric' }) }

// what the payslip says you should take home: gross less the deductions
export const takeHome = r => r2(n(r.gross) - n(r.pf) - n(r.profTax) - n(r.tds) - n(r.otherDed))

// totals for one financial year
export function fySummary(records) {
  const by = {}
  for (const r of records) {
    const y = fyStartYear(r.month)
    const s = (by[y] = by[y] || { year: y, months: 0, gross: 0, net: 0, pf: 0, tds: 0, profTax: 0, otherDed: 0, bonus: 0 })
    s.months++; s.gross += n(r.gross); s.net += n(r.net); s.pf += n(r.pf); s.tds += n(r.tds); s.profTax += n(r.profTax); s.otherDed += n(r.otherDed); s.bonus += n(r.bonus)
  }
  return Object.values(by).sort((a, b) => b.year - a.year).map(s => ({ ...s, gross: r2(s.gross), net: r2(s.net), pf: r2(s.pf), tds: r2(s.tds), profTax: r2(s.profTax), otherDed: r2(s.otherDed), bonus: r2(s.bonus) }))
}

// The salary credit for a payslip month: a credit on a bank account, close to the net pay, around that month's end.
//   matched - within ₹1 of the net pay
//   short   - something credited that looks like the salary but is less than the net pay
//   none    - nothing found
export function matchCredit(record, txns, accountIds, usedIds = new Set()) {
  const [y, m] = record.month.split('-').map(Number)
  const from = addDays(startOfMonth(new Date(y, m - 1, 1)), -5), to = addDays(endOfMonth(new Date(y, m - 1, 1)), 10)
  const net = n(record.net)
  const pool = txns.filter(t => t.type === 'credit' && accountIds.has(t.cardId) && !usedIds.has(t.id) && !t.isExcluded && t.kind !== 'card_payment' && new Date(t.date) >= from && new Date(t.date) <= to)
  if (!(net > 0)) return { state: 'none', txn: null }
  const exact = pool.filter(t => Math.abs(t.amount - net) <= 1).sort((a, b) => Math.abs(new Date(a.date) - new Date(y, m - 1, 28)) - Math.abs(new Date(b.date) - new Date(y, m - 1, 28)))[0]
  if (exact) return { state: 'matched', txn: exact }
  const salaryLike = pool.filter(t => (t.category === 'Salary' || /salary|sal\b|payroll/i.test(`${t.merchant} ${t.bankNarration || ''}`)) && t.amount < net && t.amount >= net * 0.5)
    .sort((a, b) => b.amount - a.amount)[0]
  return salaryLike ? { state: 'short', txn: salaryLike, short: r2(net - salaryLike.amount) } : { state: 'none', txn: null }
}

// late: no credit found and the usual pay day (plus 3 days) has gone by
export function isLate(record, job, now = new Date()) {
  if (!job?.salaryDay) return false
  const [y, m] = record.month.split('-').map(Number)
  return now > addDays(new Date(y, m - 1, Math.min(31, Number(job.salaryDay))), 3)
}

// ── storage ──
// who the employee is, as the payslips print it
export const EMP_FIELDS = ['employeeName', 'employeeId', 'designation', 'level', 'department', 'location', 'entity', 'bank', 'accountLast4', 'uan', 'pfNo']

export async function saveJob(job) {
  const emp = Object.fromEntries(EMP_FIELDS.map(k => [k, String(job[k] ?? '').trim()]))
  const row = { ...emp, employer: job.employer.trim(), joinDate: job.joinDate || null, endDate: job.endDate || null, ctc: n(job.ctc), salaryDay: job.salaryDay === '' ? null : Number(job.salaryDay) || null, notes: job.notes || '' }
  if (job.id != null) { await db.salaryJobs.update(job.id, row); return job.id }
  const id = await db.salaryJobs.add({ ...row, createdAt: new Date() })
  if (row.ctc > 0) await db.salaryRevisions.add({ jobId: id, date: row.joinDate || new Date().toISOString().slice(0, 10), ctc: row.ctc, kind: 'joining', note: '' })
  return id
}

export async function deleteJob(id) {
  await db.transaction('rw', db.salaryJobs, db.salaryRevisions, db.salaryRecords, db.salaryDocs, async () => {
    await db.salaryDocs.where('jobId').equals(id).modify({ jobId: null }) // the files stay, just no longer tied to that employer
    await db.salaryRevisions.where('jobId').equals(id).delete()
    await db.salaryRecords.where('jobId').equals(id).delete()
    await db.salaryJobs.delete(id)
  })
}

export async function saveRevision(rev) {
  const row = { jobId: rev.jobId, date: rev.date, ctc: n(rev.ctc), kind: rev.kind || 'hike', note: rev.note || '' }
  if (rev.id != null) await db.salaryRevisions.update(rev.id, row); else await db.salaryRevisions.add(row)
  // the employer's current CTC follows the newest revision that carries one
  const all = (await db.salaryRevisions.where('jobId').equals(rev.jobId).toArray()).filter(r => r.ctc > 0 && r.kind !== 'bonus').sort((a, b) => String(b.date).localeCompare(String(a.date)))
  if (all[0]) await db.salaryJobs.update(rev.jobId, { ctc: all[0].ctc })
}

// Saves a payslip and ties it to the bank credit when one is found (the credit is then categorised as Salary).
export async function saveRecord(rec) {
  const row = {
    jobId: rec.jobId, month: rec.month, gross: n(rec.gross), basic: n(rec.basic), hra: n(rec.hra), allowances: n(rec.allowances), bonus: n(rec.bonus),
    pf: n(rec.pf), profTax: n(rec.profTax), tds: n(rec.tds), otherDed: n(rec.otherDed), net: n(rec.net), creditedOn: rec.creditedOn || null, notes: rec.notes || '',
  }
  if (rec.profile) row.profile = rec.profile
  if (rec.components !== undefined) { row.components = rec.components; row.workedDays = rec.workedDays ?? null; row.lopDays = rec.lopDays ?? 0 }
  if (rec.source) row.source = rec.source
  if (!(row.net > 0) && row.gross > 0) row.net = takeHome(row)
  const dup = await db.salaryRecords.where('month').equals(row.month).filter(r => r.jobId === row.jobId && r.id !== rec.id).first()
  if (dup) throw new Error(`There is already a payslip for ${monthLabel(row.month)}. Edit that one.`)
  let id = rec.id
  if (id != null) await db.salaryRecords.update(id, row); else id = await db.salaryRecords.add({ ...row, createdAt: new Date() })
  await linkRecord(id)
  return id
}

export async function deleteRecord(id) { await db.salaryRecords.delete(id) }

// Looks for this payslip's bank credit and links it (or clears an old link that no longer fits)
export async function linkRecord(id) {
  const rec = await db.salaryRecords.get(id)
  if (!rec) return null
  const [cards, txns, others] = await Promise.all([db.creditCards.toArray(), db.transactions.toArray(), db.salaryRecords.toArray()])
  const accountIds = new Set(cards.filter(c => c.cardType === 'account').map(c => c.id))
  const used = new Set(others.filter(o => o.id !== id && o.txnId != null).map(o => o.txnId))
  const res = matchCredit(rec, txns, accountIds, used)
  const patch = { txnId: res.txn ? res.txn.id : null, bankState: res.state, bankShort: res.short || 0 }
  if (res.txn) {
    patch.creditedOn = new Date(res.txn.date).toISOString().slice(0, 10)
    if (res.state === 'matched' && res.txn.category !== 'Salary') await db.transactions.update(res.txn.id, { category: 'Salary' })
  }
  await db.salaryRecords.update(id, patch)
  return db.salaryRecords.get(id)
}

export async function relinkAll() {
  let matched = 0, short = 0, none = 0
  for (const r of await db.salaryRecords.toArray()) { const x = await linkRecord(r.id); if (x?.bankState === 'matched') matched++; else if (x?.bankState === 'short') short++; else none++ }
  return { matched, short, none }
}

// Saves the months read from a payslip / pay register for one employee: a month that already has a payslip is updated, a new one added.
// Each is tied to its bank credit like any payslip. Returns { added, updated }.
export async function importMonths(jobId, months, source) {
  let added = 0, updated = 0
  for (const m of months) {
    const old = await db.salaryRecords.where('month').equals(m.month).filter(r => r.jobId === jobId).first()
    await saveRecord({
      id: old?.id, jobId, month: m.month, gross: m.gross, basic: m.basic, hra: m.hra, allowances: m.allowances, bonus: m.bonus, pf: m.pf, profTax: m.profTax, tds: m.tds,
      otherDed: m.otherDed, net: m.net, profile: m.profile, components: m.components, workedDays: m.workedDays, lopDays: m.lopDays, source, notes: old?.notes || '',
    })
    if (old) updated++; else added++
  }
  return { added, updated }
}

// "28/Jun/2021" or "28 Jun 2021" -> "2021-06-28"
export function parseDoj(s) {
  const m = String(s || '').match(/(\d{1,2})[\s/.-]+([A-Za-z]{3})[a-z]*[\s/.-]+(\d{4})/)
  const mon = m && ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m[2].toLowerCase())
  return m && mon >= 0 ? `${m[3]}-${String(mon + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}` : ''
}

// ── the component split ──
// Every employer and every month splits the pay differently (an arrear one month, a lump sum another). The totals live in fixed fields;
// the split lives in record.components, and the screens show whatever components the payslips actually had.

// "BASIC SALARY" and "BASIC" are one thing; names are shown in sentence case
const CANON = [[/^(BASIC|BASIC SALARY|BASIC PAY)$/, 'Basic'], [/^(HOUSE RENT ALLOWANCE|HRA)$/, 'House rent allowance'], [/^(PROVIDENT FUND|EPF|PF|EMPLOYEE PF)$/, 'Provident fund'], [/^(PROFESSIONAL TAX|PT)$/, 'Professional tax'], [/^(INCOME TAX|TDS|TAX DEDUCTED AT SOURCE)$/, 'Income tax']]
export function prettyComponent(name) {
  const k = String(name).toUpperCase().replace(/\s+/g, ' ').trim()
  for (const [re, label] of CANON) if (re.test(k)) return label
  const t = k.toLowerCase()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

// a record's split, whether it came from a payslip (full detail) or was typed in (just the fixed fields)
export function componentsOf(r) {
  const merge = (src = {}) => { const out = {}; for (const [k, v] of Object.entries(src)) { const n2 = prettyComponent(k); out[n2] = r2((out[n2] || 0) + n(v)) } return out }
  if (r.components && (Object.keys(r.components.earnings || {}).length || Object.keys(r.components.deductions || {}).length)) {
    return { earnings: merge(r.components.earnings), deductions: merge(r.components.deductions), detailed: true }
  }
  const pick = obj => Object.fromEntries(Object.entries(obj).filter(([, v]) => n(v) > 0))
  return {
    earnings: pick({ Basic: r.basic, 'House rent allowance': r.hra, 'Other allowances': r.allowances, 'Bonus / variable pay': r.bonus }),
    deductions: pick({ 'Provident fund': r.pf, 'Professional tax': r.profTax, 'Income tax': r.tds, 'Other deductions': r.otherDed }),
    detailed: false,
  }
}

// months across, components down: { months: ['2026-01', ...], earnings: [{ name, values: { month: amount }, total }], deductions: [...], totals: { month: { gross, deductions, net } } }
export function buildStack(records) {
  const rows = [...records].sort((a, b) => a.month.localeCompare(b.month))
  const months = [...new Set(rows.map(r => r.month))]
  const table = side => {
    const by = new Map()
    for (const r of rows) for (const [name, amt] of Object.entries(componentsOf(r)[side])) { const row = by.get(name) || { name, values: {}, total: 0 }; row.values[r.month] = r2((row.values[r.month] || 0) + amt); row.total = r2(row.total + amt); by.set(name, row) }
    return [...by.values()].sort((a, b) => (a.name === 'Basic' ? -1 : b.name === 'Basic' ? 1 : b.total - a.total))
  }
  const totals = {}
  for (const r of rows) totals[r.month] = { gross: n(r.gross), deductions: r2(n(r.gross) - n(r.net)), net: n(r.net) }
  return { months, earnings: table('earnings'), deductions: table('deductions'), totals }
}

// ── the simple employer: a name and from / to dates. Everything else comes from the payslips. ──
export async function saveEmployer({ id, employer, joinDate, endDate }) {
  const row = { employer: String(employer || '').trim(), joinDate: joinDate || null, endDate: endDate || null }
  if (id != null) { await db.salaryJobs.update(id, row); return id }
  return db.salaryJobs.add({ ...row, createdAt: new Date() })
}

// a detail of a payslip by what it is called ("Management Level", "Grade" and "Level" are all the level)
const FIND = {
  employeeId: /^(employee id|emp no|employee no|emp id|emp code|employee code)\b/i, name: /^(name|employee name|emp name)$/i, designation: /^(dsgn|designation|title)\b/i,
  level: /^(management level|grade|level|band)\b/i, location: /^(location|work location|base br)\b/i, department: /^(department|dept)\b/i, doj: /^(doj|date of joining|joining date)/i,
  bank: /^bank( name)?$/i, account: /^(bank a\/c no|acc no|account no|account number|a\/c no|bank account)/i, pfNo: /^pf( no| number| account)?\.?$/i, uan: /^(pf )?uan$/i,
  entity: /^entity$/i, workedDays: /^(worked days|days paid|std days?)$/i, lopDays: /^(lop days|lwp days)$/i,
}
export const detailOf = (rec, key) => (rec?.profile || []).find(p => FIND[key].test(String(p.label).trim()))?.value || ''

// the title and level through the months: every change, oldest first, read from the payslips themselves
export function titleHistory(records) {
  const rows = [...records].filter(r => r.profile?.length).sort((a, b) => a.month.localeCompare(b.month))
  const out = []
  for (const key of ['designation', 'level']) {
    let prev = ''
    for (const r of rows) {
      const v = detailOf(r, key)
      if (!v) continue
      if (prev && v !== prev) out.push({ month: r.month, kind: key, from: prev, to: v })
      prev = v
    }
  }
  return out.sort((a, b) => a.month.localeCompare(b.month))
}

// The "who is this" block at the top of the Salary page, from the newest payslip: employee ID, date of joining, title, level, where, which
// bank and the PF / UAN numbers, and the days worked in that month. Only what the payslip had is listed.
export function profileSummary(rec, job) {
  if (!rec && !job) return []
  // what the payslip printed, else what an earlier version of the app saved on the employer (payslips added back then kept no profile)
  const d = (k, jobKey) => (rec ? detailOf(rec, k) : '') || (jobKey && job?.[jobKey]) || ''
  const doj = d('doj') || (job?.joinDate ? new Date(job.joinDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '')
  const days = rec ? detailOf(rec, 'workedDays') : ''
  const rows = [
    ['Employee ID', d('employeeId', 'employeeId')], ['Employee name', d('name', 'employeeName')], ['Date of joining', doj],
    ['Designation', d('designation', 'designation')], ['Management level / grade', d('level', 'level')], ['Department', d('department', 'department')], ['Location', d('location', 'location')], ['Entity', d('entity', 'entity')],
    ['Bank', d('bank', 'bank')], ['Account number', d('account') || (job?.accountLast4 ? '••••' + job.accountLast4 : '')], ['PF number', d('pfNo', 'pfNo')], ['UAN', d('uan', 'uan')],
    ['Worked days', days !== '' ? days + (detailOf(rec, 'lopDays') !== '' ? ' (LOP ' + detailOf(rec, 'lopDays') + ')' : '') : ''],
  ]
  return rows.filter(([, v]) => v !== '' && v != null).map(([label, value]) => ({ label, value: String(value) }))
}

// ── the Payslips list: which months to show, and what was collected over them ──
// period: 'all' | 'last3' | 'last6' | 'last12' | 'fy:2025' (Indian financial year starting that April) | 'custom' (from / to as 'YYYY-MM')
export function filterPayslips(records, { period = 'all', from = '', to = '', jobId = 'all' } = {}) {
  const sorted = [...records].sort((a, b) => b.month.localeCompare(a.month))
  const newest = sorted[0]?.month
  const back = n => { if (!newest) return ''; const [y, m] = newest.split('-').map(Number); const d = new Date(y, m - 1 - (n - 1), 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') }
  return sorted.filter(r => {
    if (jobId !== 'all' && String(r.jobId) !== String(jobId)) return false
    if (period === 'last3') return r.month >= back(3)
    if (period === 'last6') return r.month >= back(6)
    if (period === 'last12') return r.month >= back(12)
    if (String(period).startsWith('fy:')) return fyStartYear(r.month) === Number(String(period).slice(3))
    if (period === 'custom') return (!from || r.month >= from) && (!to || r.month <= to)
    return true
  })
}

// what was collected over those months
export function payTotals(records) {
  const sum = k => r2(records.reduce((s, r) => s + n(r[k]), 0))
  const months = records.length
  const gross = sum('gross'), net = sum('net'), tds = sum('tds'), pf = sum('pf'), profTax = sum('profTax')
  return { months, gross, net, tds, pf, profTax, bonus: sum('bonus'), other: r2(Math.max(0, gross - net - tds - pf - profTax)), avgNet: months ? r2(net / months) : 0 }
}

// the bars of the chart under the Payslips list: one per month, oldest to newest, stacked so the whole bar is the gross:
// take-home + income tax + provident fund + everything else deducted
export function payChartData(records) {
  return [...records].sort((a, b) => a.month.localeCompare(b.month)).map(r => {
    const gross = n(r.gross) || n(r.net), net = n(r.net), tds = n(r.tds), pf = n(r.pf)
    const [y, m] = r.month.split('-').map(Number)
    return { name: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1] + " '" + String(y).slice(2), net, tds, pf, other: r2(Math.max(0, gross - net - tds - pf)) }
  })
}
