import { db } from '../db/schema'

const DEBT_DATES = ['startDate', 'endDate']
const REPAY_DATES = ['date']

const revive = (row, fields) => {
  const out = { ...row }
  for (const f of fields) if (out[f]) out[f] = new Date(out[f])
  return out
}

export async function buildDebtBackup() {
  const [debts, debtRepayments] = await Promise.all([db.debts.toArray(), db.debtRepayments.toArray()])
  return JSON.stringify({ app: 'FinPing', kind: 'debts', version: 1, exportedAt: new Date().toISOString(), debts, debtRepayments }, null, 2)
}

// Saves as a file download; returns the filename.
export async function exportDebtsToFile() {
  const json = await buildDebtBackup()
  const name = `finping-debts-${new Date().toISOString().slice(0, 10)}.json`
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return name
}

// Merges a backup into local data. Debts already present (same name, lender and principal) are
// kept as they are, and repayments already present (same debt, date and amount) are skipped.
export async function importDebts(jsonText) {
  let data
  try { data = JSON.parse(jsonText) } catch (e) { throw new Error('That is not valid JSON') }
  if (!data || data.kind !== 'debts' || !Array.isArray(data.debts)) throw new Error('This is not a FinPing debt backup')

  const existing = await db.debts.toArray()
  const same = (a, b) => a.name === b.name && (a.lender || '') === (b.lender || '') && Number(a.principal) === Number(b.principal)
  const idMap = new Map()
  let addedDebts = 0, addedRepayments = 0

  await db.transaction('rw', db.debts, db.debtRepayments, async () => {
    for (const raw of data.debts) {
      const { id: oldId, ...rest } = revive(raw, DEBT_DATES)
      const match = existing.find(d => same(d, rest))
      if (match) { idMap.set(oldId, match.id); continue }
      const newId = await db.debts.add(rest)
      idMap.set(oldId, newId)
      existing.push({ ...rest, id: newId })
      addedDebts++
    }
    const repayments = await db.debtRepayments.toArray()
    for (const raw of data.debtRepayments || []) {
      const { id, debtId, ...rest } = revive(raw, REPAY_DATES)
      const newDebtId = idMap.get(debtId)
      if (!newDebtId) continue
      const t = new Date(rest.date).getTime()
      if (repayments.some(r => r.debtId === newDebtId && new Date(r.date).getTime() === t && r.amount === rest.amount)) continue
      await db.debtRepayments.add({ ...rest, debtId: newDebtId })
      addedRepayments++
    }
  })
  return { addedDebts, addedRepayments }
}

// Records a repayment and lowers the outstanding principal. Throws on bad input.
export async function addManualRepayment(debtId, { amount, principal, interest = 0, date, notes = '' }) {
  const amt = Number(amount)
  if (!(amt > 0)) throw new Error('Enter the amount paid')
  const interestPart = Math.min(Math.max(Number(interest) || 0, 0), amt)
  const principalPart = principal === '' || principal == null ? amt - interestPart : Number(principal)
  if (!(principalPart >= 0) || principalPart + interestPart > amt + 0.005) throw new Error('Principal + interest cannot exceed the amount paid')

  await db.transaction('rw', db.debts, db.debtRepayments, async () => {
    const debt = await db.debts.get(debtId)
    if (!debt) throw new Error('Debt not found')
    await db.debtRepayments.add({ debtId, date: date ? new Date(date) : new Date(), amount: amt, principal: principalPart, interest: interestPart, source: 'manual', rawSMS: null, notes })
    const outstanding = Math.max(0, (debt.currentOutstanding || 0) - principalPart)
    await db.debts.update(debtId, {
      currentOutstanding: outstanding,
      totalPaid: (debt.totalPaid || 0) + principalPart,
      totalInterestPaid: (debt.totalInterestPaid || 0) + interestPart,
      ...(outstanding === 0 ? { status: 'closed' } : {}),
    })
  })
}

// Deletes a repayment and puts its principal back on the debt.
export async function undoRepayment(repaymentId) {
  await db.transaction('rw', db.debts, db.debtRepayments, async () => {
    const r = await db.debtRepayments.get(repaymentId)
    if (!r) return
    const debt = await db.debts.get(r.debtId)
    if (debt) {
      await db.debts.update(debt.id, {
        currentOutstanding: (debt.currentOutstanding || 0) + (r.principal ?? r.amount),
        totalPaid: Math.max(0, (debt.totalPaid || 0) - (r.principal ?? r.amount)),
        totalInterestPaid: Math.max(0, (debt.totalInterestPaid || 0) - (r.interest || 0)),
        status: 'active',
      })
    }
    await db.debtRepayments.delete(repaymentId)
  })
}
