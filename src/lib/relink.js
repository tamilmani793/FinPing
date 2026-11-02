import { db } from '../db/schema'
import { parseSMS, detectCardKind } from './smsParser'
import { findOrCreateCard } from './ingestSMS'

// Transactions can carry a bank and last-4 tag without being linked to any card or account (saved
// by an older build, or before you added that card / account), so they never show on its page.
// This re-reads each unlinked SMS transaction and links it to the matching card or bank account.
//   create: also make the card / account when it doesn't exist yet (first run and the Settings
//           button). Automatic runs pass false so a card you deleted is never brought back.
// Balances are NOT touched: they already reflect those spends (or come from the bank's own SMS).
//   dryRun: change nothing, return what would happen: { count, items: [{ id, merchant, amount, date, target, newCard }] }
//   ids: only these transactions (the ones ticked in the Link sheet); omit for all
export async function relinkTransactions({ create = true, dryRun = false, ids = null } = {}) {
  const only = ids ? new Set(ids) : null
  const unlinked = await db.transactions.filter(t => t.cardId == null && t.rawSMS && (!only || only.has(t.id))).toArray()
  let linked = 0
  const items = []
  const rest = [] // could not be matched by digits: you choose their card / account
  const failed = [] // chosen but nothing to link them to
  for (const t of unlinked) {
    const parsed = parseSMS(t.rawSMS, '', new Date(t.date))
    if (!parsed || (parsed.type !== 'transaction' && parsed.type !== 'cashback_credited')) { if (dryRun) rest.push(brief(t)); continue }
    const kind = detectCardKind(t.rawSMS)
    // a card number but no clear card type (kind null) still links, to a card of "unknown" type, same as the preview promises
    let card = parsed.cardLast4 ? await findOrCreateCard(parsed, kind, dryRun ? false : create) : null
    if (!card && parsed.accountLast4) card = await findOrCreateCard({ ...parsed, cardLast4: parsed.accountLast4 }, 'account', dryRun ? false : create)
    if (dryRun) {
      const last4 = card?.cardLast4 || parsed.cardLast4 || parsed.accountLast4
      if (!card && !(create && last4)) { rest.push(brief(t)); continue } // would stay unlinked
      const targetType = card?.cardType || (kind === 'debit' ? 'debit' : kind === 'credit' ? 'credit' : 'account')
      items.push({ id: t.id, merchant: t.merchant, amount: t.amount, type: t.type, date: t.date, what: linkLabel(targetType, t.type, parsed.type), bank: card?.bank || parsed.bank || '', category: t.category, sms: String(t.rawSMS).slice(0, 160), target: card ? `${card.name || card.bank} ••${card.cardLast4}` : `${parsed.bank || 'Bank'} ••${last4}`, newCard: !card })
      linked++
      continue
    }
    if (!card) { failed.push(t.id); continue }
    const mode = card.cardType === 'account' ? (parsed.paymentMode || 'Bank') : card.cardType === 'debit' ? 'Debit Card' : card.cardType === 'unknown' ? 'Card' : 'Credit Card'
    await db.transactions.update(t.id, { cardId: card.id, paymentMode: mode, accountLast4: parsed.accountLast4 || parsed.cardLast4 || t.accountLast4 || null })
    linked++
  }
  if (!dryRun && ids) return { linked, failed: unlinked.filter(t => failed.includes(t.id)).length }
  return dryRun ? { count: linked, items, skipped: unlinked.length - linked, rest } : linked
}

const brief = t => ({ id: t.id, merchant: t.merchant, amount: t.amount, type: t.type, date: t.date, sms: String(t.rawSMS).slice(0, 160) })

// Tie transactions to a card / account you chose yourself (their SMS carries no digits). Balances are not changed.
export async function linkToCard(ids, cardId) {
  const card = await db.creditCards.get(cardId)
  if (!card) return 0
  const mode = card.cardType === 'account' ? 'Bank' : card.cardType === 'debit' ? 'Debit Card' : card.cardType === 'unknown' ? 'Card' : 'Credit Card'
  return db.transactions.where('id').anyOf(ids).modify({ cardId: card.id, paymentMode: mode, accountLast4: card.cardLast4 || null })
}

// plain words for what is being linked: "Credit card spend", "Bank account credit"...
function linkLabel(cardType, dir, parsedType) {
  if (parsedType === 'cashback_credited') return 'Cashback credit'
  const out = dir !== 'credit'
  if (cardType === 'account') return out ? 'Bank account debit' : 'Bank account credit'
  if (cardType === 'debit') return out ? 'Debit card spend' : 'Debit card refund'
  if (cardType === 'unknown') return out ? 'Card spend' : 'Card credit'
  return out ? 'Credit card spend' : 'Credit card refund / payment'
}

const CARD_MODES = ['Credit Card', 'Debit Card', 'Card']
const sameBank = (a, b) => !a || !b || String(a).toLowerCase().split(' ')[0] === String(b).toLowerCase().split(' ')[0]

// Which card / account a transaction belongs to, going by its link, or else by its bank + last-4 tag.
// Lets a page show spends that were tagged but never formally linked.
export function entityIdFor(txn, entities) {
  if (txn.cardId != null && entities.some(c => c.id === txn.cardId)) return txn.cardId
  if (!txn.accountLast4) return null
  const wantCard = CARD_MODES.includes(txn.paymentMode)
  const hits = entities.filter(c => c.cardLast4 === txn.accountLast4 && (wantCard ? c.cardType !== 'account' : c.cardType === 'account'))
  return (hits.find(c => sameBank(c.bank, txn.bank)) || null)?.id ?? null
}
