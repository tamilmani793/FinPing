import { db } from '../db/schema'
import { cardStats } from './cardStats'
import { groupOf } from './cards'

const r2 = n => Math.round(n * 100) / 100

// Brings the amounts stored on a credit card (and on every card sharing its limit) in line with its transactions and statement:
//   unbilled spends, current outstanding, pending (unpaid billed) amount, and the shared pool's available credit.
// Minimum due, statement amount and reward points are not derived from spends: they come from the bank's statement.
// Available credit is only worked out once a statement has been read, so it is never replaced by a guess made from a
// partial history; with a shared limit it is limit − what ALL the cards on that limit owe.
// Nothing is written when nothing changed, so screens watching the cards do not refresh in a loop.
export async function syncCardAmounts(cardId) {
  const card = await db.creditCards.get(cardId)
  if (!card || (card.cardType && card.cardType !== 'credit')) return null
  const all = await db.creditCards.toArray()
  const members = groupOf(card, all).filter(c => !c.cardType || c.cardType === 'credit')
  const stats = new Map()
  for (const m of members) stats.set(m.id, cardStats(m, await db.transactions.where('cardId').equals(m.id).toArray()))

  const limit = Math.max(0, ...members.map(m => m.creditLimit || 0))
  const hasStatement = members.some(m => !!m.statementCycleKey)
  const owed = [...stats.values()].reduce((sum, s) => sum + s.tracked, 0)
  const available = limit > 0 && hasStatement ? Math.max(0, r2(limit - owed)) : null

  for (const m of members) {
    const s = stats.get(m.id)
    const patch = { unbilled: r2(s.unbilled), currentBalance: r2(s.tracked), pendingDue: r2(s.pendingBilled) }
    if (available != null) patch.availableCredit = available
    const changed = Object.entries(patch).some(([k, v]) => Math.abs((m[k] || 0) - v) > 0.004)
    if (changed) await db.creditCards.update(m.id, patch)
  }
  return db.creditCards.get(cardId)
}
