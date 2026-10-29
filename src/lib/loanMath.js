import { differenceInCalendarDays, startOfDay } from 'date-fns'

// Reducing-balance loan maths. The rate is per year, interest accrues every day on what is still
// outstanding, and each EMI pays that interest first - only the rest lowers the principal.
const round2 = n => Math.round(n * 100) / 100

// Interest the loan costs per day at today's outstanding balance.
export const dailyInterest = d => ((d.currentOutstanding || 0) * (d.interestRate || 0)) / 100 / 365

// Latest repayment date for a debt, from a list of its repayments.
export const lastRepaymentDate = repayments => {
  const dates = (repayments || []).map(r => new Date(r.date).getTime()).filter(Boolean)
  return dates.length ? new Date(Math.max(...dates)) : null
}

// Days the current interest period covers: from the last payment (or from when the balance was last
// set) up to `asOf`. With nothing to count from, one month is assumed.
export function interestDays(d, asOf = new Date(), lastPaid = null) {
  const from = d.interestFrom || lastPaid
  if (!from) return 30
  return Math.max(0, Math.min(366, differenceInCalendarDays(startOfDay(new Date(asOf)), startOfDay(new Date(from)))))
}

// How a payment divides: interest for the days since the last payment, the remainder is principal.
export function splitPayment(d, amount, asOf = new Date(), lastPaid = null) {
  const days = interestDays(d, asOf, lastPaid)
  const perDay = round2(dailyInterest(d))
  const accrued = round2(dailyInterest(d) * days)
  const interest = round2(Math.min(amount, accrued))
  return { days, perDay, accrued, interest, principal: round2(Math.max(0, amount - interest)) }
}
