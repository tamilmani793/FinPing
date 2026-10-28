import { db } from '../db/schema'
import { DUP_WINDOW_MS, isSameTransaction, smsSignals } from './dedupeCore'

export { DUP_WINDOW_MS, isSameTransaction }
const DAY = 24 * 60 * 60 * 1000
const REACH = 36 * 60 * 60 * 1000 // far enough to find a loan EMI posted on its due date and the bank's alert for it

// An already-saved transaction that the new one duplicates (card payments are handled separately).
// The decision (same reference number, same running balance, same time stamp...) lives in dedupeCore.
export async function findDuplicate(candidate) {
  const t = new Date(candidate.date).getTime()
  const near = await db.transactions.where('date').between(new Date(t - REACH), new Date(t + REACH), true, true).toArray()
  return near.find(x => x.kind !== 'card_payment' && isSameTransaction(x, candidate)) || null
}

const noMerchant = m => !m || /^unknown$/i.test(String(m).trim())

// Folds the second SMS into the first: keeps one entry, but fills in anything the first one lacked.
export async function mergeDuplicate(existing, extra, smsText) {
  const patch = { extraSMS: [...(existing.extraSMS || []), smsText].filter(Boolean) }
  // What you edited, or what your bank statement says, is never overwritten by a later SMS: it is only remembered.
  if (existing.userEdited || existing.stmtKey) { await db.transactions.update(existing.id, patch); return }
  if (noMerchant(existing.merchant) && !noMerchant(extra.merchant)) patch.merchant = extra.merchant
  if ((!existing.category || existing.category === 'General') && extra.category && extra.category !== 'General') patch.category = extra.category
  if (!existing.accountLast4 && extra.accountLast4) patch.accountLast4 = extra.accountLast4
  if (!existing.bank && extra.bank) patch.bank = extra.bank
  if (existing.cardId == null && extra.cardId != null) patch.cardId = extra.cardId
  await db.transactions.update(existing.id, patch)
}

// Money moved between two of your own accounts shows up as a debit AND a credit that quote the same
// reference number. Both are marked as a transfer and left out of the income / expense totals.
export async function pairTransfer(txn) {
  const mine = smsSignals(txn.rawSMS).refs
  if (!mine.size) return false
  const t = new Date(txn.date).getTime()
  const near = await db.transactions.where('date').between(new Date(t - DAY), new Date(t + DAY), true, true).toArray()
  const mate = near.find(x => x.id !== txn.id && x.type !== txn.type && Math.abs(x.amount - txn.amount) < 0.01 && [...smsSignals(x.rawSMS).refs].some(r => mine.has(r)))
  if (!mate) return false
  await db.transactions.update(txn.id, { kind: 'transfer', isExcluded: true })
  await db.transactions.update(mate.id, { kind: 'transfer', isExcluded: true })
  return true
}
