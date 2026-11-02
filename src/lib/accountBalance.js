import { db } from '../db/schema'
import { parseSMS } from './smsParser'

// Rebuild a bank account's balance from its transactions: start from the newest balance the bank itself
// reported in an SMS ("Avl bal" / "Bal"), then apply every later credit and debit.
// txns: the account's own transactions plus those of its linked debit cards.
export async function recalcAccountBalance(account, txns) {
  const list = txns.filter(t => !t.isExcluded).sort((a, b) => new Date(a.date) - new Date(b.date) || a.id - b.id)
  let anchor = -1, bal = null
  list.forEach((t, i) => {
    const p = t.rawSMS ? parseSMS(t.rawSMS, '', new Date(t.date)) : null
    if (p && p.availableLimit != null) { anchor = i; bal = p.availableLimit }
  })
  if (bal == null) return null // the bank never reported a balance: nothing to build from
  let applied = 0
  for (const t of list.slice(anchor + 1)) { bal += t.type === 'debit' ? -t.amount : t.amount; applied++ }
  bal = Math.round(bal * 100) / 100
  await db.creditCards.update(account.id, { accountBalance: bal })
  return { balance: bal, applied, from: list[anchor].date }
}
