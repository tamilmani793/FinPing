import { endOfDay, subDays } from 'date-fns'
import { cycleDates } from './cycle'
import { excludedFor } from './cardCatalog'

export const isCardPayment = t => t.kind === 'card_payment' || t.category === 'Card Payment'

// Does this spend earn rewards on this card? (false = excluded, with the reason)
export function rewardStatus(card, txn) {
  if (txn.type !== 'debit') return { eligible: false, reason: null }
  if (txn.isExcluded) return { eligible: false, reason: 'Excluded by you' }
  if (excludedFor(card).includes(txn.category)) return { eligible: false, reason: txn.category }
  return { eligible: true, reason: null }
}

// Everything the card detail screen shows, worked out from the card's own transactions.
//   spends before the statement date are "billed"; after it they are "unbilled".
export function cardStats(card, txns, now = new Date()) {
  const dates = cycleDates(card, now)
  const payments = txns.filter(isCardPayment).sort((a, b) => new Date(b.date) - new Date(a.date))
  const bill = txns.filter(t => !isCardPayment(t)) // spends and refunds; payments are tracked separately
  const signed = t => (t.type === 'debit' ? t.amount : -t.amount)
  const sum = list => list.reduce((s, t) => s + signed(t), 0)

  let unbilledTxns = [], billedTxns = [], prevStatement = null
  if (dates.statementDate) {
    const cut = endOfDay(dates.statementDate)
    prevStatement = cycleDates(card, subDays(dates.statementDate, 1)).statementDate
    const prevCut = prevStatement ? endOfDay(prevStatement) : new Date(0)
    unbilledTxns = bill.filter(t => new Date(t.date) > cut)
    billedTxns = bill.filter(t => new Date(t.date) > prevCut && new Date(t.date) <= cut)
  } else {
    unbilledTxns = bill
  }

  const unbilled = dates.statementDate ? Math.max(0, sum(unbilledTxns)) : (card.unbilled || 0)
  const billedSpends = Math.max(0, sum(billedTxns))
  const hasStatement = !!dates.key && card.statementCycleKey === dates.key
  const paymentsThisCycle = dates.statementDate ? payments.filter(p => new Date(p.date) >= dates.statementDate) : []
  const override = dates.key && card.statusCycle === dates.key && typeof card.statusPaid === 'boolean' ? card.statusPaid : null

  // Total amount due = the billed amount still unpaid. Without a billing cycle there are no dates to
  // split spends by, so fall back to what was entered / read from the last statement SMS.
  let billed, paidThisCycle, pendingBilled
  if (dates.key) {
    billed = hasStatement ? (card.statementBalance || 0) : billedSpends
    paidThisCycle = paymentsThisCycle.reduce((s, p) => s + p.amount, 0)
    pendingBilled = Math.max(0, billed - paidThisCycle)
  } else {
    billed = card.statementBalance || 0
    pendingBilled = Math.max(0, card.pendingDue ?? billed)
    paidThisCycle = Math.max(0, billed - pendingBilled)
  }
  if (override === true) pendingBilled = 0
  const status = billed <= 0 ? 'none' : pendingBilled <= 0 ? 'paid' : paidThisCycle > 0 ? 'partial' : 'pending'

  // A due date only means something while part of a bill is still unpaid.
  const owing = status === 'pending' || status === 'partial'

  // Current outstanding = what is still due on the bill + everything spent after it.
  const totalDue = pendingBilled
  const outstanding = pendingBilled + unbilled
  const limit = card.creditLimit || 0
  const available = card.availableCredit || 0
  return {
    dates, prevStatement, unbilled, billed, billedIsEstimate: !hasStatement && !!dates.key, billedSpends,
    paidThisCycle, pendingBilled, status, payments, paymentsThisCycle,
    unbilledTxns, billedTxns,
    totalDue, outstanding, owing,
    bankUsed: limit > 0 ? Math.max(0, limit - available) : null, // what the bank's available limit implies is in use
    limit, available, utilPct: limit ? Math.min(100, Math.round(((limit - available) / limit) * 100)) : 0,
  }
}

// Spend that counts towards the annual-fee waiver. Each card year runs from one issue-date anniversary to the next and
// is judged on its own: spends only, leaving out your own exclusions, card bill payments and the categories that earn no
// rewards, less refunds. `years` lists the current card year and up to four earlier ones, newest first.
export function feeWaiverSpend(card, txns, now = new Date(), threshold = card.feeWaiverThreshold || 0) {
  const issued = card.issueDate || card.annualFeeDate
  const base = issued ? new Date(issued) : null
  const hasBase = !!base && !Number.isNaN(+base)
  let start = hasBase ? new Date(now.getFullYear(), base.getMonth(), base.getDate()) : new Date(now.getFullYear() - 1, now.getMonth(), now.getDate() + 1)
  if (start > now) start = new Date(start.getFullYear() - 1, start.getMonth(), start.getDate())
  const skip = excludedFor(card)
  const counts = t => !t.isExcluded && !isCardPayment(t) && !skip.includes(t.category)
  const net = (from, to) => txns
    .filter(t => counts(t) && new Date(t.date) >= from && new Date(t.date) < to)
    .reduce((a, t) => a + (t.type === 'debit' ? t.amount : t.type === 'credit' ? -t.amount : 0), 0)
  const yearEnd = from => new Date(from.getFullYear() + 1, from.getMonth(), from.getDate())
  const years = []
  for (let from = start, n = 0; n < 5 && (!hasBase || from >= new Date(base.getFullYear(), base.getMonth(), base.getDate())); n++, from = new Date(from.getFullYear() - 1, from.getMonth(), from.getDate())) {
    const to = yearEnd(from)
    const spent = Math.max(0, net(from, to > now ? new Date(now.getTime() + 1) : to))
    years.push({ start: from, end: to, spent, met: threshold > 0 && spent >= threshold, current: n === 0 })
  }
  return { spent: years[0].spent, start, end: yearEnd(start), years, hasIssueDate: hasBase }
}
