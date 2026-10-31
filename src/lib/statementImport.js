import { db } from '../db/schema'
import { reconcile, correction, newEntry } from './statement'
import { applyTxnToCard } from './ingestSMS'
import { cycleDates } from './cycle'
import { setLimitFields } from './cards'
import { saveRewardStatement } from './rewardTagging'

// The saved entries a bank account's statement should agree with: the account's own and those of its linked debit cards.
export async function accountEntries(account) {
  const allCards = await db.creditCards.toArray()
  const isCard = account.cardType !== 'account'
  // a bank account's statement also lists what its debit cards spent; a credit card's statement is that card alone
  const linked = isCard ? [] : allCards.filter(c => c.linkedAccountId === account.id)
  const ids = new Set([account.id, ...linked.map(c => c.id)])
  const sameAccountRecord = new Set(allCards.filter(c => c.cardType === 'account' && c.id !== account.id && c.cardLast4 && c.cardLast4 === account.cardLast4).map(c => c.id))
  const unknownCards = new Set(allCards.filter(c => c.cardType === 'unknown').map(c => c.id))
  const debtLinked = new Set((await db.debtRepayments.toArray()).map(r => r.accountTxnId).filter(Boolean))
  const out = []
  for (const t of await db.transactions.toArray()) {
    const mine = ids.has(t.cardId)
    // an SMS that named no card, or only an untyped one, may still be this account's: it is matched too,
    // but only ever removed when it duplicates a statement line. For a card, the last 4 digits must agree.
    const twin = !mine && !isCard && account.cardLast4 && t.accountLast4 === account.cardLast4 && sameAccountRecord.has(t.cardId) // another record of this same account
    const loose = twin || (!mine && (t.cardId == null || unknownCards.has(t.cardId)) && (!isCard || (account.cardLast4 && t.accountLast4 === account.cardLast4)))
    if (!mine && !loose) continue
    out.push({ ...t, ...(loose ? { _loose: true } : {}), ...(debtLinked.has(t.id) ? { kind: t.kind || 'loan_payment' } : {}) })
  }
  return out
}

export async function planStatement(account, rows) {
  // The statement is the truth: every line on it is kept, even one whose earlier SMS entry you deleted (so totals agree with the bank's)
  const plan = reconcile(rows, await accountEntries(account), [], rows.window || null)
  plan.check = rows.check || null
  plan.cardSummary = rows.cardSummary || null
  return plan
}

// Applies the plan: corrects matched entries, adds the missing ones, removes the chosen extras.
export async function applyStatement(account, plan, { removeIds = [], setBalance = true, updateBill = false } = {}) {
  await db.transaction('rw', db.transactions, db.creditCards, db.reward_statements, async () => {
    for (const { row, txn } of plan.matched) {
      const fields = correction(row, txn)
      if (txn._loose) fields.cardId = account.id // it is now known to be this account's
      if (fields.stmtKey !== txn.stmtKey || fields.merchant !== txn.merchant || +fields.date !== +new Date(txn.date)) await db.transactions.update(txn.id, fields)
    }
    for (const row of plan.toAdd) await db.transactions.add(newEntry(row, account.id, account))
    if (removeIds.length) {
      // a credit card entry that is taken away gives back what it added to the card's balance
      for (const id of removeIds) {
        const t = await db.transactions.get(id)
        const card = t && t.cardId != null && t.parsedBy !== 'manual' ? await db.creditCards.get(t.cardId) : null
        if (card && (!card.cardType || card.cardType === 'credit')) await applyTxnToCard(card, t.type === 'debit' ? 'credit' : 'debit', t.amount)
      }
      await db.transactions.bulkDelete(removeIds)
    }
    if (setBalance && plan.closingBalance != null && account.cardType === 'account') await db.creditCards.update(account.id, { accountBalance: plan.closingBalance })
    if (updateBill && plan.cardSummary && (!account.cardType || account.cardType === 'credit')) await applyCardSummary(account, plan.cardSummary)
  })
  return { corrected: plan.matched.length, added: plan.toAdd.length, removed: removeIds.length }
}

// Brings a credit card's bill details up to the figures its statement printed: total due, minimum due, statement day and limits.
async function applyCardSummary(card, sm) {
  const fresh = await db.creditCards.get(card.id)
  const patch = { statementBalance: sm.totalDue, pendingDue: sm.totalDue, minimumDue: sm.minDue || 0, unbilled: 0, statusPaid: sm.totalDue <= 0 }
  if (!fresh.cycleSet || !(Number(fresh.billingCycleDate) >= 1)) { patch.billingCycleDate = String(sm.statementDate.getDate()); patch.cycleSet = true }
  if (sm.rewardPoints != null) patch.rewardPoints = sm.rewardPoints
  if (sm.rewardsEarned != null) await saveRewardStatement(card.id, sm.statementDate, { earned: sm.rewardsEarned, opening: sm.rewardsOpening ?? null, closing: sm.rewardPoints ?? null, disbursed: sm.rewardsDisbursed ?? null, lapsed: sm.rewardsLapsed ?? null, programs: sm.rewardPrograms || null })
  patch.statementPurchases = sm.purchases != null ? sm.purchases : null
  if (sm.dueDate && !(Number(fresh.paymentDueDays) > 0)) patch.paymentDueDays = Math.max(0, Math.round((sm.dueDate - sm.statementDate) / 86400000))
  const merged = { ...fresh, ...patch }
  const key = cycleDates(merged, sm.statementDate).key || null
  patch.statementCycleKey = key; patch.statusCycle = key
  await db.creditCards.update(card.id, patch)
  if (sm.creditLimit > 0) await setLimitFields(merged, { creditLimit: sm.creditLimit, availableCredit: sm.availableCredit })
}
