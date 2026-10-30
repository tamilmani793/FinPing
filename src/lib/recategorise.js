import { db } from '../db/schema'
import { classifyCategory } from './smsParser'
import { tagAllCards } from './rewardTagging'

// Wallet loads (Paytm / Amazon Pay / PhonePe wallet top-ups, prepaid card loads...) that were filed under another category before the parser
// learned to spot them. Only spends are touched; a category you set yourself, cashback and card payments are left alone.
export async function recategoriseWalletLoads() {
  let n = 0
  for (const t of await db.transactions.toArray()) {
    if (t.type !== 'debit' || t.kind || t.isExcluded || t.category === 'Wallet Load' || t.category === 'Cashback') continue
    if ((t.editedFields || []).includes('category')) continue
    const text = [t.merchant, t.bankNarration, t.description, t.narration].filter(Boolean).join(' ')
    if (classifyCategory(t.merchant || '', text) !== 'Wallet Load') continue
    await db.transactions.update(t.id, { category: 'Wallet Load' })
    n++
  }
  if (n) tagAllCards().catch(() => {}) // wallet loads earn nothing on most cards, so the expected rewards change
  return n
}
