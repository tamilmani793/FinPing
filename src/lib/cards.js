import { db } from '../db/schema'

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

const num = v => (v === '' || v == null ? 0 : Number(v) || 0)
const toDate = v => (v ? new Date(v) : null)

// Saves everything on the edit form. `form` holds strings straight from the inputs.
//   sharedWith: ids of the other cards that share this card's limit (empty = not shared)
//   sameStatement: copy statement dates / status / amounts to every card in the group
export async function saveCardEdit(cardId, form, { sharedWith = [], sameStatement = false } = {}) {
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
  // 3. Statement data: this card, or the whole group when "same statement" is on.
  const statementFields = {
    statementBalance: num(form.statementBalance),
    pendingDue: num(form.pendingDue),
    minimumDue: num(form.minimumDue),
    unbilled: num(form.unbilled),
  }
  const targets = sameStatement ? [...chosen] : [cardId]
  const isPaid = form.status === 'paid'
  for (const id of targets) {
    await db.creditCards.update(id, { ...statementFields, currentBalance: statementFields.pendingDue + statementFields.unbilled })
    const stmts = await db.creditCardStatements.where('cardId').equals(id).toArray()
    stmts.sort((a, b) => new Date(b.statementDate || 0) - new Date(a.statementDate || 0))
    const row = { cardId: id, statementDate: toDate(form.statementDate), dueDate: toDate(form.dueDate), isPaid, totalDue: statementFields.statementBalance, minimumDue: statementFields.minimumDue }
    if (stmts[0]) await db.creditCardStatements.update(stmts[0].id, row)
    else if (form.statementDate || form.dueDate || statementFields.statementBalance) await db.creditCardStatements.add(row)
  }

  // 4. Card's own details.
  await db.creditCards.update(cardId, {
    name: form.name.trim() || me.name,
    bank: form.bank.trim() || me.bank,
    totalAnnualFee: num(form.totalAnnualFee),
    isLTF: num(form.totalAnnualFee) === 0,
    feeWaiverThreshold: num(form.feeWaiverThreshold),
  })
}
