import { addMonths, differenceInCalendarDays, startOfDay } from 'date-fns'

// EMI schedule maths for loans and EMI purchases. Pure functions: nothing here touches the database.
//
// A loan keeps a small cursor:  currentOutstanding (principal still owed), nextEmiDate (the next due date),
// paidCount (EMIs posted so far) and interestFrom (the date interest has been counted up to).
// Each EMI on its due date is split into
//     interest  = outstanding x rate / 365 x days since interestFrom   (daily interest on what is still owed)
//     principal = EMI - interest                                         (the only part that lowers the balance)
const round2 = n => Math.round(n * 100) / 100

// EMI purchases (debit / credit card EMI, consumer EMI) come with a fixed schedule from the seller or bank;
// everything else is a reducing-balance loan.
export const FIXED_TYPES = ['DebitCardEMI', 'CreditCardEMI', 'ConsumerEMI']
export const defaultMode = type => (FIXED_TYPES.includes(type) ? 'fixed' : 'reducing')

const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate()
const at = (y, m, day) => new Date(y, m, Math.min(day, daysInMonth(y, m)), 12)

// the day of the month EMIs fall on (31 = last day of shorter months)
export const anchorDay = d => Number(d.emiDate) || (d.nextEmiDate ? new Date(d.nextEmiDate).getDate() : 1)

// the due date one month after `date`, on the same day of the month
export function followingDue(date, day) {
  const n = addMonths(new Date(date.getFullYear(), date.getMonth(), 1), 1)
  return at(n.getFullYear(), n.getMonth(), day)
}

// the first date on or after `from` that falls on `day` of a month
export function firstDueOnOrAfter(from, day) {
  const f = startOfDay(from)
  let d = at(f.getFullYear(), f.getMonth(), day)
  if (startOfDay(d) < f) d = followingDue(d, day)
  return d
}

// Interest for one instalment. A loan with a rate accrues daily on the balance; an EMI purchase with no rate
// spreads whatever it costs on top of the price evenly over its instalments.
function interestFor(debt, outstanding, from, due) {
  const rate = Number(debt.interestRate) || 0
  if (rate > 0) {
    const days = from ? Math.max(0, differenceInCalendarDays(startOfDay(due), startOfDay(new Date(from)))) : 30
    return (outstanding * rate / 100 / 365) * days
  }
  const n = Number(debt.tenureMonths) || 0
  return n > 0 ? Math.max(0, (Number(debt.emiAmount) * n - Number(debt.principal || 0)) / n) : 0
}

// One instalment given the loan's state. `no` is the number of this instalment (1 = the first EMI).
export function installment(debt, state, due, no) {
  // A bank-supplied schedule (debit / credit card EMI statement) is used exactly as printed.
  const row = Array.isArray(debt.schedule) ? debt.schedule[no - 1] : null
  if (row) {
    const last = no >= debt.schedule.length
    const principal = last ? state.outstanding : Math.min(row.principal, state.outstanding)
    return {
      no, date: due, statementDate: row.statementDate, interest: round2(row.interest), principal: round2(principal),
      emi: round2(principal + row.interest), outstandingAfter: round2(Math.max(0, state.outstanding - principal)), final: last || state.outstanding - principal <= 0.005,
    }
  }
  const emi = Number(debt.emiAmount) || 0
  // `carry` is interest already earned on the old balance before a part payment lowered it
  const interest = Math.min(interestFor(debt, state.outstanding, state.from, due) + (state.carry || 0), emi)
  const lastOne = (Number(debt.tenureMonths) > 0 && no >= Number(debt.tenureMonths)) || emi - interest >= state.outstanding
  const principal = lastOne ? state.outstanding : Math.max(0, emi - interest)
  return {
    no, date: due, interest: round2(interest), principal: round2(principal),
    emi: round2(lastOne ? principal + interest : emi),
    outstandingAfter: round2(Math.max(0, state.outstanding - principal)), final: lastOne,
  }
}

// Everything still to come, from the loan's current state until it is paid off.
// The amount of the next EMI: the next row of a bank schedule, otherwise the fixed EMI.
export const nextEmiAmount = debt => {
  const row = Array.isArray(debt.schedule) ? debt.schedule[debt.paidCount || 0] : null
  return row ? round2(row.principal + row.interest) : Number(debt.emiAmount) || 0
}

// Interest earned on the old balance from `interestFrom` up to `date` (used when a part payment lowers the
// balance part-way through a month: that stretch is still charged on the balance it was owed on).
export function accrualUntil(debt, date) {
  const rate = Number(debt.interestRate) || 0
  if (!(rate > 0) || Array.isArray(debt.schedule) || !debt.interestFrom) return 0
  const days = Math.max(0, differenceInCalendarDays(startOfDay(new Date(date)), startOfDay(new Date(debt.interestFrom))))
  return round2((debt.currentOutstanding || 0) * rate / 100 / 365 * days)
}

// A bank schedule after a part payment: the instalments already paid stay as they were; the rest are worked
// out again on the lower balance (same EMI, interest = balance x rate / 12), so the loan ends sooner.
export function rebuildSchedule(debt, outstanding) {
  const done = (debt.schedule || []).slice(0, debt.paidCount || 0)
  const next = (debt.schedule || [])[debt.paidCount || 0]
  if (!next || !(outstanding > 0.005)) return debt.schedule
  const emi = Number(debt.emiAmount) || 0, rate = Number(debt.interestRate) || 0
  const day = new Date(next.dueDate).getDate()
  const rows = [...done]
  let bal = round2(outstanding), due = new Date(next.dueDate), stmt = next.statementDate ? new Date(next.statementDate) : null
  while (bal > 0.005 && rows.length < 600) {
    const interest = round2(bal * rate / 100 / 12)
    const final = emi - interest >= bal || emi <= interest
    const principal = final ? bal : round2(emi - interest)
    bal = round2(bal - principal)
    rows.push({ no: rows.length + 1, dueDate: due, statementDate: stmt || undefined, principal, interest, emi: round2(principal + interest), balanceAfter: bal, estimated: true })
    if (final) break
    due = followingDue(due, day)
    if (stmt) stmt = addMonths(stmt, 1)
  }
  return rows
}

export function projectSchedule(debt, { maxRows = 600 } = {}) {
  const out = { rows: [], endDate: null, remaining: 0, totalInterest: 0, totalToPay: 0, neverEnds: false }
  if (!(debt.emiAmount > 0) || !debt.nextEmiDate || !(debt.currentOutstanding > 0)) return out
  let outstanding = debt.currentOutstanding
  let from = debt.interestFrom
  let carry = Number(debt.accruedInterest) || 0
  let due = new Date(debt.nextEmiDate)
  let no = (debt.paidCount || 0) + 1
  const day = anchorDay(debt)
  while (outstanding > 0.005 && out.rows.length < maxRows) {
    const row = installment(debt, { outstanding, from, carry }, due, no)
    carry = 0
    out.rows.push(row)
    out.totalInterest += row.interest
    out.totalToPay += row.emi
    if (row.final) break
    if (row.principal <= 0) { out.neverEnds = true; break } // the EMI only covers the interest
    outstanding = row.outstandingAfter
    from = due
    due = Array.isArray(debt.schedule) ? new Date(debt.schedule[no].dueDate) : followingDue(due, day)
    no += 1
  }
  out.remaining = out.rows.length
  out.endDate = out.rows.length ? out.rows[out.rows.length - 1].date : null
  out.totalInterest = round2(out.totalInterest)
  out.totalToPay = round2(out.totalToPay)
  return out
}
