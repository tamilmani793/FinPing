import { startOfDay } from 'date-fns'
import { db } from '../db/schema'
import { recordRepayment } from './debtBackup'
import { installment, anchorDay, followingDue, firstDueOnOrAfter, defaultMode } from './loanSchedule'

// Posts every EMI that has fallen due, on its due date, without any SMS: interest for the days since the
// last posting, the rest as principal, the balance reduced, and one ledger line per instalment.
// Safe to run any time and as often as you like: each loan's cursor (nextEmiDate / paidCount) moves
// past what was posted, so nothing posts twice. Months missed while the app was closed are caught up.

// Loans saved before schedules existed have an EMI amount and an EMI day but no cursor. They start from
// the next due day and are NOT back-posted, so their balances don't change.
async function initSchedule(d, today) {
  if (!(Number(d.emiDate) >= 1)) return null
  const next = firstDueOnOrAfter(new Date(today.getTime() + 86400000), Number(d.emiDate))
  await db.debts.update(d.id, { nextEmiDate: next, paidCount: d.paidCount || 0, mode: d.mode || defaultMode(d.type), interestFrom: d.interestFrom || today })
  return db.debts.get(d.id)
}

async function run(now) {
  const today = startOfDay(now)
  const debts = await db.debts.filter(d => d.status !== 'closed' && d.emiAmount > 0).toArray()
  let posted = 0
  for (let d of debts) {
    if (d.autoEmi === false) continue
    if (!d.nextEmiDate) { d = await initSchedule(d, today); if (!d) continue }
    let guard = 0
    while (d && d.status !== 'closed' && d.nextEmiDate && startOfDay(new Date(d.nextEmiDate)) <= today && guard++ < 240) {
      const due = new Date(d.nextEmiDate)
      const no = (d.paidCount || 0) + 1
      const inst = installment(d, { outstanding: d.currentOutstanding, from: d.interestFrom, carry: d.accruedInterest || 0 }, due, no)
      await recordRepayment(d.id, { amount: inst.emi, principal: inst.principal, interest: inst.interest, date: due, source: 'auto', installmentNo: no, statementDate: inst.statementDate || null })
      const after = await db.debts.get(d.id)
      const finished = inst.final || after.currentOutstanding <= 0.005
      await db.debts.update(d.id, {
        paidCount: no,
        // a bank schedule names every due date; otherwise it is the same day next month
        nextEmiDate: finished ? null : (Array.isArray(d.schedule) ? new Date(d.schedule[no].dueDate) : followingDue(due, anchorDay(d))),
        ...(finished ? { status: 'closed', currentOutstanding: 0 } : {}),
      })
      d = await db.debts.get(d.id)
      posted++
    }
  }
  return posted
}

let running = null
export const postDueEmis = (now = new Date()) => (running ||= run(now).finally(() => { running = null }))
