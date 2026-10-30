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
export async function saveJob(job) {
  const row = { employer: job.employer.trim(), joinDate: job.joinDate || null, endDate: job.endDate || null, ctc: n(job.ctc), salaryDay: job.salaryDay === '' ? null : Number(job.salaryDay) || null, notes: job.notes || '' }
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
