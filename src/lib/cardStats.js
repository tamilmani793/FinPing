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
  const billed = hasStatement ? (card.statementBalance || 0) : billedSpends
  const paymentsThisCycle = dates.statementDate ? payments.filter(p => new Date(p.date) >= dates.statementDate) : []
  const paidThisCycle = paymentsThisCycle.reduce((s, p) => s + p.amount, 0)

  const override = dates.key && card.statusCycle === dates.key && typeof card.statusPaid === 'boolean' ? card.statusPaid : null
  let pendingBilled = Math.max(0, billed - paidThisCycle)
  if (override === true) pendingBilled = 0
  const status = billed <= 0 ? 'none' : pendingBilled <= 0 ? 'paid' : paidThisCycle > 0 ? 'partial' : 'pending'

  const outstanding = card.currentBalance || 0
  const limit = card.creditLimit || 0
  const available = card.availableCredit || 0
  return {
    dates, prevStatement, unbilled, billed, billedIsEstimate: !hasStatement, billedSpends,
    paidThisCycle, pendingBilled, status, payments, paymentsThisCycle,
    unbilledTxns, billedTxns,
    outstanding, other: outstanding - pendingBilled - unbilled,
    limit, available, utilPct: limit ? Math.min(100, Math.round(((limit - available) / limit) * 100)) : 0,
  }
}
