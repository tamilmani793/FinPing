import { db } from '../db/schema'
import { cycleKeyFor, getRules } from './rewardTagging'

// Rewards Audit: for each billing cycle, what the card should have earned (the sum of the expected-reward tags on its spends) against
// what the bank actually credited:
//   points cards   - "Rewards earned" printed on the statement (stored when the statement is imported)
//   cashback cards - the cashback credits in that cycle, less any cashback reversals
// A difference means the bank treated something differently (another category, an excluded merchant, a cap you did not know about).

const r2 = n => Math.round(n * 100) / 100

export async function buildAudit(cardId) {
  const card = await db.creditCards.get(cardId)
  const rules = await getRules(cardId)
  if (!card || !rules) return { card, rules, rows: [] }
  const type = rules.rewardType === 'points' ? 'points' : 'cashback'
  const txns = await db.transactions.where('cardId').equals(cardId).toArray()
  const stmts = await db.reward_statements.where('cardId').equals(cardId).toArray()
  const cycles = new Map()
  const get = key => { if (!cycles.has(key)) cycles.set(key, { cycleKey: key, expected: 0, credited: 0, spends: [], earning: 0, statement: null }); return cycles.get(key) }
  for (const t of txns) {
    if (t.expectedReward?.cycleKey) {
      const c = get(t.expectedReward.cycleKey)
      c.expected += t.expectedReward.amount || 0
      if (t.expectedReward.amount > 0) { c.earning++; c.spends.push(t) }
    }
    if (type === 'cashback' && t.category === 'Cashback') get(cycleKeyFor(card, t.date)).credited += t.type === 'credit' ? t.amount : -t.amount
  }
  for (const s of stmts) get(s.cycleKey).statement = s
  const tol = type === 'points' ? 1 : 1 // within 1 point / ₹1 is rounding, not a discrepancy
  const rows = [...cycles.values()].map(c => {
    const actual = type === 'points' ? (c.statement?.earned ?? null) : (c.credited > 0 || c.expected > 0 ? r2(c.credited) : null)
    const diff = actual == null ? null : r2(actual - c.expected)
    const status = actual == null ? 'unknown' : Math.abs(diff) <= tol ? 'match' : diff < 0 ? 'short' : 'over'
    return { cycleKey: c.cycleKey, type, expected: r2(c.expected), actual, diff, status, earning: c.earning, topSpends: c.spends.sort((a, b) => (b.expectedReward.amount || 0) - (a.expectedReward.amount || 0)).slice(0, 8) }
  }).filter(r => r.expected > 0 || r.actual != null).sort((a, b) => b.cycleKey.localeCompare(a.cycleKey))
  return { card, rules, rows }
}
