// FinPing — Reward & Cap Engine
// Calculates cashback/points per transaction respecting monthly caps

import { db } from '../db/schema.js'

function matchRule(rule, merchant, category) {
  const m = (merchant || '').toLowerCase()
  const c = (category || '').toLowerCase()

  if (rule.matchType === 'merchant') {
    return rule.targets.some(t => m.includes(t.toLowerCase()))
  }
  if (rule.matchType === 'category') {
    return rule.targets.some(t => c.includes(t.toLowerCase()))
  }
  if (rule.matchType === 'BASE') return true
  return false
}

export async function getCumulativeCapUsed(cardId, ruleId, period, month, quarter, year) {
  let txns
  if (period === 'monthly') {
    txns = await db.creditCardTransactions
      .where('cardId').equals(cardId)
      .filter(t => {
        const d = new Date(t.date)
        return d.getFullYear() === year && d.getMonth() === month && t.rewardRuleMatched === ruleId
      }).toArray()
  } else if (period === 'quarterly') {
    const qMonths = { 1: [0,1,2], 2: [3,4,5], 3: [6,7,8], 4: [9,10,11] }[quarter] || []
    txns = await db.creditCardTransactions
      .where('cardId').equals(cardId)
      .filter(t => {
        const d = new Date(t.date)
        return d.getFullYear() === year && qMonths.includes(d.getMonth()) && t.rewardRuleMatched === ruleId
      }).toArray()
  } else {
    return 0
  }
  return txns.reduce((sum, t) => sum + (t.rewardEarned || 0), 0)
}

export function getCapStatus(rewardAtFullRate, cumulative, capLimit, capPeriod) {
  if (capPeriod === 'excluded') return 'excluded'
  if (capPeriod === 'uncapped' || capLimit === 0) return 'uncapped'
  if (cumulative >= capLimit) return 'exceeded'
  if (cumulative + rewardAtFullRate > capLimit) return 'partial'
  return 'within'
}

export async function calculateReward(transaction, card) {
  const { amount, merchant, category } = transaction
  if (!card || !card.rewardRules) return { rewardEarned: 0, ruleId: null, capStatus: 'excluded', pointsEarned: 0, rate: 0 }

  const now = new Date(transaction.date || new Date())
  const month = now.getMonth()
  const year = now.getFullYear()
  const quarter = Math.floor(month / 3) + 1

  // Multi-tier rule matching: merchant → category → BASE
  let matchedRule = null
  for (const rule of card.rewardRules) {
    if (rule.matchType === 'merchant' && matchRule(rule, merchant, category)) { matchedRule = rule; break }
  }
  if (!matchedRule) {
    for (const rule of card.rewardRules) {
      if (rule.matchType === 'category' && matchRule(rule, merchant, category)) { matchedRule = rule; break }
    }
  }
  if (!matchedRule) {
    matchedRule = card.rewardRules.find(r => r.matchType === 'BASE')
  }
  if (!matchedRule) return { rewardEarned: 0, ruleId: null, capStatus: 'excluded', pointsEarned: 0, rate: 0 }

  // Excluded check
  if (matchedRule.capPeriod === 'excluded' || matchedRule.rate === 0) {
    return { rewardEarned: 0, ruleId: matchedRule.id, capStatus: 'excluded', pointsEarned: 0, rate: 0 }
  }

  // Minimum transaction amount check (Swiggy HDFC)
  if (matchedRule.minTxnAmount && amount < matchedRule.minTxnAmount) {
    const baseRule = card.rewardRules.find(r => r.matchType === 'BASE')
    const baseRate = baseRule?.rate || 0.01
    const reward = Math.round(amount * baseRate * 100) / 100
    return { rewardEarned: reward, ruleId: matchedRule.id, capStatus: 'within', pointsEarned: Math.floor(reward / (card.pointValue || 1)), rate: baseRate }
  }

  const fullReward = Math.round(amount * matchedRule.rate * 100) / 100

  // Cap logic
  if (matchedRule.capPeriod === 'uncapped' || !matchedRule.cap) {
    return { rewardEarned: fullReward, ruleId: matchedRule.id, capStatus: 'uncapped', pointsEarned: Math.floor(fullReward / (card.pointValue || 1)), rate: matchedRule.rate }
  }

  const cumulative = await getCumulativeCapUsed(card.id, matchedRule.id, matchedRule.capPeriod, month, quarter, year)
  const capStatus = getCapStatus(fullReward, cumulative, matchedRule.cap, matchedRule.capPeriod)

  let rewardEarned = 0
  if (capStatus === 'within') {
    rewardEarned = fullReward
  } else if (capStatus === 'partial') {
    const remaining = matchedRule.cap - cumulative
    const excessAmount = amount - (remaining / matchedRule.rate)
    rewardEarned = Math.round((remaining + excessAmount * (matchedRule.postCapRate || 0)) * 100) / 100
  } else if (capStatus === 'exceeded') {
    rewardEarned = Math.round(amount * (matchedRule.postCapRate || 0) * 100) / 100
  }

  return {
    rewardEarned,
    ruleId: matchedRule.id,
    capStatus,
    pointsEarned: Math.floor(rewardEarned / (card.pointValue || 1)),
    rate: matchedRule.rate,
    cumulative,
    capLimit: matchedRule.cap,
  }
}

export async function summariseByPeriod(cardId, period = 'monthly') {
  const txns = await db.creditCardTransactions.where('cardId').equals(cardId).toArray()
  const result = {}

  for (const t of txns) {
    const d = new Date(t.date)
    let key
    if (period === 'monthly') key = `${d.getFullYear()}-${d.getMonth()}`
    else if (period === 'quarterly') key = `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`
    else key = `${d.getFullYear()}`

    if (!result[key]) result[key] = { spend: 0, rewards: 0, points: 0, txnCount: 0 }
    result[key].spend += t.amount || 0
    result[key].rewards += t.rewardEarned || 0
    result[key].points += t.pointsEarned || 0
    result[key].txnCount++
  }
  return result
}

export function getQuarter(month) {
  return Math.floor(month / 3) + 1
}
