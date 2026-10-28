import { db } from '../db/schema'
import { reconcile, correction, newEntry } from './statement'

// The saved entries a bank account's statement should agree with: the account's own and those of its linked debit cards.
export async function accountEntries(account) {
  const cards = await db.creditCards.filter(c => c.linkedAccountId === account.id).toArray()
  const ids = [account.id, ...cards.map(c => c.id)]
  const all = await db.transactions.where('cardId').anyOf(ids).toArray()
  // entries a loan's ledger points at must stay
  const debtLinked = new Set((await db.debtRepayments.toArray()).map(r => r.accountTxnId).filter(Boolean))
  return all.map(t => (debtLinked.has(t.id) ? { ...t, kind: t.kind || 'loan_payment' } : t))
}

export async function planStatement(account, rows) {
  return reconcile(rows, await accountEntries(account))
}

// Applies the plan: corrects matched entries, adds the missing ones, removes the chosen extras.
export async function applyStatement(account, plan, { removeIds = [], setBalance = true } = {}) {
  await db.transaction('rw', db.transactions, db.creditCards, async () => {
    for (const { row, txn } of plan.matched) {
      const fields = correction(row, txn)
      if (fields.stmtKey !== txn.stmtKey || fields.merchant !== txn.merchant || +fields.date !== +new Date(txn.date)) await db.transactions.update(txn.id, fields)
    }
    for (const row of plan.toAdd) await db.transactions.add(newEntry(row, account.id, account))
    if (removeIds.length) await db.transactions.bulkDelete(removeIds)
    if (setBalance && plan.closingBalance != null) await db.creditCards.update(account.id, { accountBalance: plan.closingBalance })
  })
  return { corrected: plan.matched.length, added: plan.toAdd.length, removed: removeIds.length }
}
