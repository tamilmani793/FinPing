import { db } from '../db/schema'
import { classifyCategory } from './smsParser'
import { tagAllCards } from './rewardTagging'

// a transaction you added or changed yourself keeps its category (these tidy-ups are only for what the app guessed)
const isMine = t => !!t.userEdited || t.parsedBy === 'manual' || t.parsedBy === 'auto-edited' || (t.editedFields || []).includes('category')

// Wallet loads (Paytm / Amazon Pay / PhonePe wallet top-ups, prepaid card loads...) that were filed under another category before the parser
// learned to spot them. Only spends are touched; a category you set yourself, cashback and card payments are left alone.
export async function recategoriseWalletLoads() {
  let n = 0
  for (const t of await db.transactions.toArray()) {
    if (t.type !== 'debit' || t.kind || t.isExcluded || t.category === 'Wallet Load' || t.category === 'Cashback') continue
    if (isMine(t)) continue
    const text = [t.merchant, t.bankNarration, t.description, t.narration].filter(Boolean).join(' ')
    if (classifyCategory(t.merchant || '', text) !== 'Wallet Load') continue
    await db.transactions.update(t.id, { category: 'Wallet Load' })
    n++
  }
  if (n) tagAllCards().catch(() => {}) // wallet loads earn nothing on most cards, so the expected rewards change
  return n
}

// Cash withdrawals saved before the ATM Withdrawal category existed: a spend whose name has ATM in it moves there.
// A category you set yourself, cashback and card payments are left alone.
export async function recategoriseAtm() {
  let n = 0
  for (const t of await db.transactions.toArray()) {
    if (t.type !== 'debit' || t.kind || t.isExcluded || t.category === 'ATM Withdrawal' || t.category === 'Cashback') continue
    if (isMine(t)) continue
    if (!/\batm\b/i.test(t.merchant || '')) continue
    await db.transactions.update(t.id, { category: 'ATM Withdrawal' })
    n++
  }
  if (n) tagAllCards().catch(() => {})
  return n
}

// Categories that were guessed from loose words in the SMS ("current" read as rent, "premium" as EMI, "Tata CLiQ" as a utility) are guessed again
// with the corrected rules. Only spends you did not categorise yourself, in the categories that cards leave out of rewards, are touched.
const GUESSED = ['Rent', 'EMI', 'Insurance', 'Utilities & Bills', 'Government & Tax', 'Education', 'Jewellery & Gold', 'Fuel', 'Investment', 'Wallet Load']
export async function recategoriseGuesses() {
  let n = 0
  for (const t of await db.transactions.toArray()) {
    if (t.type !== 'debit' || t.kind || t.isExcluded || t.parsedBy === 'manual' || !GUESSED.includes(t.category)) continue
    if (isMine(t)) continue
    const text = t.rawSMS || t.bankNarration || t.merchant || ''
    const next = classifyCategory(t.merchant || '', text)
    if (!next || next === t.category) continue
    await db.transactions.update(t.id, { category: next })
    n++
  }
  if (n) tagAllCards().catch(() => {})
  return n
}
