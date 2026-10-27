import { addDays, addMonths, format, startOfDay } from 'date-fns'

// A card's billing cycle is two numbers: the day of the month the statement is generated, and how
// many days after that the payment is due. Real dates are worked out from those, so they roll
// forward every month by themselves.
const clampDay = (year, month, day) => new Date(year, month, Math.min(day, new Date(year, month + 1, 0).getDate()))

export const cycleSet = card => !!card?.cycleSet && Number(card.billingCycleDate) >= 1

// { statementDate, dueDate, nextStatementDate, nextDueDate, key } or {} when the cycle isn't set up.
export function cycleDates(card, now = new Date()) {
  if (!cycleSet(card)) return {}
  const day = Math.min(31, Math.max(1, Number(card.billingCycleDate)))
  const dueDays = Math.max(0, Number(card.paymentDueDays) || 0)
  const today = startOfDay(now)
  let statementDate = clampDay(today.getFullYear(), today.getMonth(), day)
  if (statementDate > today) statementDate = clampDay(addMonths(statementDate, -1).getFullYear(), addMonths(statementDate, -1).getMonth(), day)
  const next = addMonths(new Date(statementDate.getFullYear(), statementDate.getMonth(), 1), 1)
  const nextStatementDate = clampDay(next.getFullYear(), next.getMonth(), day)
  return {
    statementDate,
    dueDate: addDays(statementDate, dueDays),
    nextStatementDate,
    nextDueDate: addDays(nextStatementDate, dueDays),
    key: format(statementDate, 'yyyy-MM-dd'),
  }
}

// Paid / pending for the current statement. A status saved against this cycle wins; otherwise it
// follows whether anything is still pending on the statement.
export function isStatementPaid(card, dates = cycleDates(card)) {
  if (dates.key && card.statusCycle === dates.key && typeof card.statusPaid === 'boolean') return card.statusPaid
  return !((card.pendingDue ?? card.statementBalance ?? 0) > 0)
}

export const ordinal = n => {
  const v = n % 100
  return `${n}${[, 'st', 'nd', 'rd'][(v - 20) % 10] || [, 'st', 'nd', 'rd'][v] || 'th'}`
}
