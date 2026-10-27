import { db } from '../db/schema'
import { DUP_WINDOW_MS, isSameTransaction, mergeDuplicate } from './dedupe'
import { applyTxnToCard } from './ingestSMS'

const DAY = 24 * 60 * 60 * 1000

// Finds transactions that are the same payment reported by two SMS and keeps just one of each.
// The one removed is folded into the one kept (its SMS text is attached), and the effect it had on a
// card's or linked account's balance is taken back. Returns how many entries were removed.
export async function removeDuplicateTransactions() {
  const all = (await db.transactions.toArray())
    .filter(t => t.kind !== 'card_payment')
    .sort((a, b) => new Date(a.date) - new Date(b.date))
  const kept = []
  let removed = 0

  for (const t of all) {
    let keep = null
    for (let i = kept.length - 1; i >= 0; i--) {
      if (new Date(t.date) - new Date(kept[i].date) > DUP_WINDOW_MS) break // sorted by time: nothing older can match
      if (isSameTransaction(kept[i], t)) { keep = kept[i]; break }
    }
    if (!keep) { kept.push(t); continue }

    await mergeDuplicate(keep, t, t.rawSMS)
    Object.assign(keep, await db.transactions.get(keep.id))
    if (t.cardId != null && t.parsedBy !== 'manual') {
      const card = await db.creditCards.get(t.cardId)
      if (card && card.cardType !== 'account' && card.cardType !== 'unknown') await applyTxnToCard(card, t.type === 'debit' ? 'credit' : 'debit', t.amount)
    }
    await db.transactions.delete(t.id)
    removed++
  }

  // A card payment confirmed twice (received, then posted): same card + amount within a day.
  const payments = (await db.transactions.toArray()).filter(t => t.kind === 'card_payment').sort((a, b) => new Date(a.date) - new Date(b.date))
  const seen = []
  for (const p of payments) {
    const twin = seen.find(s => s.cardId === p.cardId && Math.abs(s.amount - p.amount) < 0.01 && Math.abs(new Date(p.date) - new Date(s.date)) < DAY)
    if (twin) { await db.transactions.delete(p.id); removed++ } else seen.push(p)
  }
  return removed
}
