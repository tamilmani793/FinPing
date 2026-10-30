import { format } from 'date-fns'
import { db } from '../db/schema'
import { cycleDates } from './cycle'
import { calculateExpectedReward, EMPTY_TOTALS, DEFAULT_RULES } from './rewardRules'
import { getMccMap } from './mcc'

// Tags every spend on a credit card with the reward it should earn (transaction.expectedReward), using the card's own rules
// (table card_reward_rules). Billing-cycle caps are applied in date order within each cycle. Everything runs on the device.

export async function getRules(cardId) { return (await db.card_reward_rules.where('cardId').equals(cardId).first()) || null }

// Rules are versioned: the row holds the current rules plus effectiveFrom / publishedOn / source, and `history` keeps the older versions.
// A spend is worked out with the version in force on its date, so a bank's later change never rewrites the past.
const RULE_FIELDS = ['enabled', 'rewardType', 'base', 'minSpend', 'capPerCycle', 'rounding', 'capPeriod', 'baseCap', 'spendBlock', 'accelerated', 'exclusions', 'effectiveFrom', 'publishedOn', 'source']
const snapshot = row => Object.fromEntries(RULE_FIELDS.filter(k => row[k] !== undefined).map(k => [k, row[k]]))

export function rulesFor(row, date) {
  if (!row) return null
  const ds = format(new Date(date), 'yyyy-MM-dd')
  if (!row.effectiveFrom || ds >= row.effectiveFrom || !(row.history || []).length) return row
  const older = [...row.history].sort((a, b) => String(b.effectiveFrom || '').localeCompare(String(a.effectiveFrom || '')))
  const hit = older.find(h => !h.effectiveFrom || h.effectiveFrom <= ds) || older[older.length - 1]
  return { ...row, ...hit, cardId: row.cardId }
}

// `asNewVersion`: keep what was there as history and start the new rules from rules.effectiveFrom (a bank changed its terms)
export async function saveRules(rules, { asNewVersion = false } = {}) {
  const old = await getRules(rules.cardId)
  const row = { ...rules, updatedAt: new Date(), history: old?.history || rules.history || [] }
  if (asNewVersion && old && rules.effectiveFrom) {
    const prev = snapshot(old)
    if (!prev.effectiveFrom || prev.effectiveFrom !== rules.effectiveFrom) row.history = [...row.history.filter(h => h.effectiveFrom !== prev.effectiveFrom), prev]
  }
  if (old) { await db.card_reward_rules.update(old.id, row); row.id = old.id } else row.id = await db.card_reward_rules.add(row)
  await db.creditCards.update(rules.cardId, { rewardRulesOptOut: false })
  await tagCardRewards(rules.cardId)
  return row
}

export async function deleteRules(cardId) {
  await db.card_reward_rules.where('cardId').equals(cardId).delete()
  await db.creditCards.update(cardId, { rewardRulesOptOut: true }) // you removed them on purpose: do not add them again by themselves
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
  let totals = EMPTY_TOTALS(), period = null, earning = 0
  for (const t of txns) {
    let tag
    const rv = rulesFor(rules, t.date)
    if (rv && rv.enabled !== false && t.type === 'debit' && !t.isExcluded && t.kind !== 'card_payment') {
      const key = cycleKeyFor(card, t.date)
      // caps reset every billing cycle, or every calendar month for cards that say so; a change of rule version also starts afresh
      const pkey = (rv.capPeriod === 'calendarMonth' ? format(new Date(t.date), 'yyyy-MM') : key) + '|' + (rv.effectiveFrom || '')
      if (pkey !== period) { period = pkey; totals = EMPTY_TOTALS() }
      const r = calculateExpectedReward(t, rv, totals, mccMap)
      tag = { ...r, cycleKey: key }
      totals.earned += r.amount
      if (r.rule.kind === 'accelerated' || r.rule.kind === 'base') totals.byRule[r.rule.id] = (totals.byRule[r.rule.id] || 0) + r.amount
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
