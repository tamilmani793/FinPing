import { format } from 'date-fns'
import { db } from '../db/schema'
import { cycleDates } from './cycle'
import { calculateExpectedReward, EMPTY_TOTALS, DEFAULT_RULES } from './rewardRules'
import { getMccMap } from './mcc'

// Tags every spend on a credit card with the reward it should earn (transaction.expectedReward), using the card's own rules
// (table card_reward_rules). Billing-cycle caps are applied in date order within each cycle. Everything runs on the device.

export async function getRules(cardId) { return (await db.card_reward_rules.where('cardId').equals(cardId).first()) || null }

export async function saveRules(rules) {
  const row = { ...rules, updatedAt: new Date() }
  const old = await getRules(rules.cardId)
  if (old) { await db.card_reward_rules.update(old.id, row); row.id = old.id } else row.id = await db.card_reward_rules.add(row)
  await tagCardRewards(rules.cardId)
  return row
}

export async function deleteRules(cardId) {
  await db.card_reward_rules.where('cardId').equals(cardId).delete()
  await tagCardRewards(cardId)
}

// the billing cycle a date falls in = the statement date that closes it ('yyyy-MM-dd'); a card with no cycle set uses calendar months
export function cycleKeyFor(card, date) {
  const d = new Date(date)
  if (card?.cycleSet) {
    const c = cycleDates(card, d)
    if (c.statementDate) {
      const sameDay = format(c.statementDate, 'yyyy-MM-dd') === format(d, 'yyyy-MM-dd')
      return format(sameDay ? c.statementDate : c.nextStatementDate, 'yyyy-MM-dd')
    }
  }
  return format(d, 'yyyy-MM')
}

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

// (Re)computes the tag on every transaction of one card. Returns how many spends earn something.
export async function tagCardRewards(cardId) {
  const card = await db.creditCards.get(cardId)
  if (!card || (card.cardType && card.cardType !== 'credit')) return 0
  const rules = await getRules(cardId)
  const txns = (await db.transactions.where('cardId').equals(cardId).toArray()).sort((a, b) => new Date(a.date) - new Date(b.date) || a.id - b.id)
  const mccMap = rules ? await getMccMap() : {}
  let totals = EMPTY_TOTALS(), cycle = null, earning = 0
  for (const t of txns) {
    let tag
    if (rules && rules.enabled !== false && t.type === 'debit' && !t.isExcluded && t.kind !== 'card_payment') {
      const key = cycleKeyFor(card, t.date)
      if (key !== cycle) { cycle = key; totals = EMPTY_TOTALS() }
      const r = calculateExpectedReward(t, rules, totals, mccMap)
      tag = { ...r, cycleKey: key }
      totals.earned += r.amount
      if (r.rule.kind === 'accelerated') totals.byRule[r.rule.id] = (totals.byRule[r.rule.id] || 0) + r.amount
      if (r.amount > 0) earning++
    }
    if (!same(t.expectedReward, tag)) await db.transactions.update(t.id, { expectedReward: tag })
  }
  return earning
}

export async function tagAllCards() {
  let n = 0
  for (const c of await db.creditCards.toArray()) if (!c.cardType || c.cardType === 'credit') n += await tagCardRewards(c.id)
  return n
}

// What the statement said the bank credited for a cycle (points earned / closing balance); used by the audit
export async function saveRewardStatement(cardId, statementDate, { earned = null, opening = null, closing = null } = {}) {
  const cycleKey = format(new Date(statementDate), 'yyyy-MM-dd')
  const old = await db.reward_statements.where('cardId').equals(cardId).filter(r => r.cycleKey === cycleKey).first()
  const row = { cardId, cycleKey, earned, opening, closing, addedAt: new Date() }
  if (old) await db.reward_statements.update(old.id, row); else await db.reward_statements.add(row)
}

export { DEFAULT_RULES }
