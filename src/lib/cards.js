import { db } from '../db/schema'
import { cycleDates } from './cycle'

// Cards that share one credit limit carry the same `limitGroup` id.
export const groupOf = (card, cards) =>
  card?.limitGroup ? cards.filter(c => c.limitGroup === card.limitGroup) : card ? [card] : []

// Sum of available credit across cards, counting a shared limit only once.
export function totalAvailableCredit(cards) {
  const seen = new Set()
  let total = 0
  for (const c of cards) {
    if (c.limitGroup) {
      if (seen.has(c.limitGroup)) continue
      seen.add(c.limitGroup)
    }
    total += c.availableCredit || 0
  }
  return total
}

// Sets limit / available credit on a card and every card sharing its limit.
export async function setLimitFields(card, { creditLimit, availableCredit }) {
  const all = await db.creditCards.toArray()
  const patch = {}
  if (creditLimit != null) patch.creditLimit = creditLimit
  if (availableCredit != null) patch.availableCredit = availableCredit
  for (const c of groupOf(card, all)) await db.creditCards.update(c.id, patch)
}

// Moves the shared pool's available credit by `delta` (negative = spend), keeping it within 0..limit.
export async function shiftAvailable(cardId, delta) {
  const all = await db.creditCards.toArray()
  const card = all.find(c => c.id === cardId)
  if (!card) return
  const members = groupOf(card, all)
  let availableCredit = Math.max(0, (card.availableCredit || 0) + delta)
  if (card.creditLimit > 0) availableCredit = Math.min(availableCredit, card.creditLimit)
  for (const c of members) await db.creditCards.update(c.id, { availableCredit })
}

export const GST_RATE = 0.18
const money = n => Math.round(n * 100) / 100
// Annual fee is entered before GST; GST at 18% is added on top.
export const annualFeeFields = base => ({
  annualFee: money(base), annualFeeGST: money(base * GST_RATE), totalAnnualFee: money(base * (1 + GST_RATE)), isLTF: !(base > 0),
})

const num = v => (v === '' || v == null ? 0 : Number(v) || 0)
// The annual fee falls on the card's issue anniversary: the first one on or after `from`.
export function nextAnniversary(issued, from = new Date()) {
  if (!issued) return null
  const m = typeof issued === 'string' && issued.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3], 12) : new Date(issued)
  if (Number.isNaN(+d)) return null
  const at = y => new Date(y, d.getMonth(), Math.min(d.getDate(), new Date(y, d.getMonth() + 1, 0).getDate()), 12)
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  let n = at(today.getFullYear())
  if (new Date(n.getFullYear(), n.getMonth(), n.getDate()) < today) n = at(today.getFullYear() + 1)
  return n
}

const toDate = v => (v ? new Date(v) : null)

// Saves everything on the edit form. `form` holds strings straight from the inputs.
//   sharedWith: ids of the other cards that share this card's limit (empty = not shared)
//   sameStatement: copy statement dates / status / amounts to every card in the group
export async function saveCardEdit(cardId, form, { sharedWith = [], sameStatement = false } = {}) {
  const cardType = form.cardType === 'debit' ? 'debit' : form.cardType === 'account' ? 'account' : 'credit'
  const identity = {
    name: (form.name || '').trim(), bank: (form.bank || '').trim(), cardType,
    network: form.network || '', variant: (form.variant || '').trim(), partner: (form.partner || '').trim(), draft: false,
  }

  // Debit cards and bank accounts have no limit, statement, fee or shared pool: save the identity and leave the pool.
  if (cardType !== 'credit') {
    const me = await db.creditCards.get(cardId)
    if (!me) throw new Error('Card not found')
    await db.creditCards.update(cardId, {
      ...identity, name: identity.name || me.name, bank: identity.bank || me.bank,
      cardLast4: (form.cardLast4 || '').replace(/\D/g, '').slice(-4) || me.cardLast4, notes: form.notes || '',
      linkedAccountId: cardType === 'debit' && form.linkedAccountId !== '' && form.linkedAccountId != null ? Number(form.linkedAccountId) : null,
      ...(cardType === 'account' ? { accountBalance: form.accountBalance === '' || form.accountBalance == null ? null : Number(form.accountBalance) || 0, network: '', variant: (form.variant || '').trim(), partner: '' } : {}),
      limitGroup: null, creditLimit: 0, availableCredit: 0, currentBalance: 0, statementBalance: 0, pendingDue: 0, minimumDue: 0, unbilled: 0,
      totalAnnualFee: 0, isLTF: true, feeWaiverThreshold: 0,
    })
    const left = await db.creditCards.toArray()
    for (const c of left) if (c.limitGroup && left.filter(x => x.limitGroup === c.limitGroup).length < 2) await db.creditCards.update(c.id, { limitGroup: null })
    return
  }

  const limit = num(form.creditLimit)
  const available = num(form.availableCredit)
  if (limit > 0 && available > limit) throw new Error('Available credit cannot be more than the credit limit')

  const all = await db.creditCards.toArray()
  const me = all.find(c => c.id === cardId)
  if (!me) throw new Error('Card not found')

  // 1. Work out the new sharing group. Ticking nobody means only this card leaves its group.
  const chosen = new Set([cardId, ...sharedWith])
  const previousGroup = me.limitGroup
  let groupId = null
  if (chosen.size > 1) {
    groupId = previousGroup || all.find(c => chosen.has(c.id) && c.limitGroup)?.limitGroup || `grp_${Date.now()}`
    for (const c of all) {
      if (chosen.has(c.id)) await db.creditCards.update(c.id, { limitGroup: groupId })
      else if (previousGroup && c.limitGroup === previousGroup) await db.creditCards.update(c.id, { limitGroup: null })
    }
  } else {
    await db.creditCards.update(cardId, { limitGroup: null })
  }
  // A group left with a single card is no group at all.
  const after = await db.creditCards.toArray()
  for (const c of after) if (c.limitGroup && after.filter(x => x.limitGroup === c.limitGroup).length < 2) await db.creditCards.update(c.id, { limitGroup: null })

  // 2. Limit and available credit apply to the whole group.
  for (const id of chosen) await db.creditCards.update(id, { creditLimit: limit, availableCredit: available })
  // 3. Billing cycle + statement amounts: this card, or the whole group when "same statement" is on.
  const day = Math.min(31, Math.max(0, Math.round(num(form.billingCycleDate))))
  const dueDays = Math.max(0, Math.round(num(form.paymentDueDays)))
  const cycle = day >= 1 ? { billingCycleDate: day, paymentDueDays: dueDays, cycleSet: true } : { cycleSet: false }
  const statementFields = {
    statementBalance: num(form.statementBalance),
    pendingDue: num(form.pendingDue),
    minimumDue: num(form.minimumDue),
    unbilled: num(form.unbilled),
    // "Current outstanding" is what is owed right now; when left blank it is pending due + unbilled spends.
    currentBalance: form.currentBalance === '' || form.currentBalance == null ? num(form.pendingDue) + num(form.unbilled) : num(form.currentBalance),
  }
  const probe = { ...cycle, billingCycleDate: day }
  const key = cycleDates(probe).key || null
  // statusPaid is only kept when the user explicitly marked it; the screen works it out from payments otherwise.
  const status = { statusPaid: form.status === 'paid', statusCycle: key, ...(statementFields.statementBalance > 0 ? { statementCycleKey: key } : {}) }
  const targets = sameStatement ? [...chosen] : [cardId]
  for (const id of targets) await db.creditCards.update(id, { ...statementFields, ...cycle, ...status })

  // 4. Card's own details.
  await db.creditCards.update(cardId, {
    ...identity, name: identity.name || me.name, bank: identity.bank || me.bank,
    cardLast4: (form.cardLast4 || '').replace(/\D/g, '').slice(-4) || me.cardLast4,
    linkedAccountId: null,
    ...annualFeeFields(num(form.annualFee)),
    feeWaiverThreshold: num(form.feeWaiverThreshold),
    issueDate: toDate(form.issueDate),
    annualFeeDate: nextAnniversary(toDate(form.issueDate)),
    interestRate: num(form.interestRate),
    rewardPoints: num(form.rewardPoints),
    notes: form.notes || '',
    ...(Array.isArray(form.excludedCategories) ? { excludedCategories: form.excludedCategories } : {}),
  })
}

// Records a payment made towards a credit card (for payments the SMS did not capture).
// It reduces what is owed and frees up the limit; it is flagged excluded so it never counts as income.
export async function recordPayment(cardId, { amount, date, notes = '' }) {
  const amt = Number(amount)
  if (!(amt > 0)) throw new Error('Enter the amount paid')
  const card = await db.creditCards.get(cardId)
  if (!card) throw new Error('Card not found')
  await db.transactions.add({
    date: date ? new Date(date) : new Date(), amount: amt, type: 'credit', merchant: 'Card payment', category: 'Card Payment',
    paymentMode: 'Credit Card', bank: card.bank || '', accountLast4: card.cardLast4 || null, cardId,
    rawSMS: null, parsedBy: 'manual', kind: 'card_payment', tags: [], notes, isExcluded: true, createdAt: new Date(),
  })
  await db.creditCards.update(cardId, {
    currentBalance: Math.max(0, (card.currentBalance || 0) - amt),
    pendingDue: Math.max(0, (card.pendingDue ?? card.statementBalance ?? 0) - amt),
  })
  await shiftAvailable(cardId, amt)
}

// Undoes a manually recorded payment.
export async function removePayment(txnId) {
  const t = await db.transactions.get(txnId)
  if (!t) return
  const card = t.cardId != null ? await db.creditCards.get(t.cardId) : null
  if (card) {
    await db.creditCards.update(card.id, { currentBalance: (card.currentBalance || 0) + t.amount })
    await shiftAvailable(card.id, -t.amount)
  }
  await db.transactions.delete(txnId)
}
