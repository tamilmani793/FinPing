import { db } from '../db/schema'
import { parseSMS, detectCardKind } from './smsParser'
import { findOrCreateCard } from './ingestSMS'

// Older transactions (saved before cards/accounts existed, or before the parser knew an account
// number format) can carry a bank and last-4 tag without being linked to anything, so they never
// show up on an account's or card's page. This re-reads each unlinked SMS-based transaction and
// links it to the matching card or bank account, creating that entry if it doesn't exist yet.
// Balances are NOT touched: they already reflect those spends (or come from the bank's own SMS).
export async function relinkTransactions() {
  const unlinked = await db.transactions.filter(t => t.cardId == null && t.rawSMS).toArray()
  let linked = 0
  for (const t of unlinked) {
    const parsed = parseSMS(t.rawSMS, '', new Date(t.date))
    if (!parsed || (parsed.type !== 'transaction' && parsed.type !== 'cashback_credited')) continue
    const kind = detectCardKind(t.rawSMS)
    let card = kind ? await findOrCreateCard(parsed, kind) : null
    if (!card && parsed.accountLast4) card = await findOrCreateCard({ ...parsed, cardLast4: parsed.accountLast4 }, 'account')
    if (!card) continue
    const mode = card.cardType === 'account' ? (parsed.paymentMode || 'Bank') : card.cardType === 'debit' ? 'Debit Card' : card.cardType === 'unknown' ? 'Card' : 'Credit Card'
    await db.transactions.update(t.id, { cardId: card.id, paymentMode: mode, accountLast4: parsed.accountLast4 || parsed.cardLast4 || t.accountLast4 || null })
    linked++
  }
  return linked
}
