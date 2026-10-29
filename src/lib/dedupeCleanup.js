import { db } from '../db/schema'
import { planCleanup } from './dedupeCore'
import { mergeDuplicate } from './dedupe'
import { applyTxnToCard } from './ingestSMS'

// Tidies transactions that were saved wrongly or twice, using the same rules new SMS are held to:
//   - messages that moved no money (OTPs, failed / declined payments, reminders, bill notices, requests) are removed
//   - "SBI Card bill ... paid" confirmations become a payment on that card instead of a second spend
//   - one payment reported by several SMS is merged into a single entry
//   - a debit and a credit quoting the same reference (your own transfer) are marked as a transfer
// Genuine repeats (4 ATM withdrawals of the same amount) are left alone: the SMS' own reference,
// balance and time stamp tell them apart. Returns counts of what changed.
export async function removeDuplicateTransactions() {
  const [txns, cards] = await Promise.all([db.transactions.toArray(), db.creditCards.toArray()])
  const plan = planCleanup(txns, cards)
  const byId = new Map(txns.map(t => [t.id, t]))

  // take back what a saved row did to a card's / linked account's balance
  const undo = async t => {
    if (!t || t.cardId == null || t.parsedBy === 'manual') return
    const card = await db.creditCards.get(t.cardId)
    if (card && !['account', 'unknown'].includes(card.cardType)) await applyTxnToCard(card, t.type === 'debit' ? 'credit' : 'debit', t.amount)
  }

  for (const id of plan.remove) { await undo(byId.get(id)); await db.transactions.delete(id) }

  for (const { id, cardId } of plan.payments) {
    await undo(byId.get(id))
    await db.transactions.update(id, { type: 'credit', merchant: 'Card payment', category: 'Card Payment', kind: 'card_payment', paymentMode: 'Credit Card', cardId, isExcluded: true })
  }

  for (const { keep, drop } of plan.merge) {
    const k = await db.transactions.get(keep)
    const d = byId.get(drop)
    if (!k || !d) continue
    await mergeDuplicate(k, d, d.rawSMS)
    await undo(d)
    await db.transactions.delete(drop)
  }

  for (const [a, b] of plan.transfers) {
    await db.transactions.update(a, { kind: 'transfer', isExcluded: true })
    await db.transactions.update(b, { kind: 'transfer', isExcluded: true })
  }

  return { removed: plan.remove.length, converted: plan.payments.length, merged: plan.merge.length, transfers: plan.transfers.length }
}
