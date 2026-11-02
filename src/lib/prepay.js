import { addMonths } from 'date-fns'
import { projectSchedule, rebuildSchedule } from './loanSchedule'

// "What if I pay extra?": the loan's schedule with a one-time part payment now and / or a little more every month, against what it is today,
// and what the same money would have grown to if it were invested instead (before tax, at the return you choose).

// A flexible loan (cash credit, overdraft, flexible repayment) has no fixed EMI schedule: you pay what you choose, and interest runs on what is owed.
export const isFlexible = d => !(Number(d.emiAmount) > 0) || !d.nextEmiDate

// months to clear `balance` paying `pay` a month, with interest each month on what is still owed
function simulate(balance, ratePct, pay, from = new Date()) {
  const i = (Number(ratePct) || 0) / 1200
  let b = balance, months = 0, interest = 0
  if (!(b > 0.005)) return { remaining: 0, totalInterest: 0, endDate: null, neverEnds: false }
  while (b > 0.005 && months < 600) {
    const int = b * i
    if (pay <= int + 0.005) return { remaining: months, totalInterest: Math.round(interest), endDate: null, neverEnds: true }
    interest += int
    b = b + int - pay
    months++
  }
  return { remaining: months, totalInterest: Math.round(interest), endDate: addMonths(from, months), neverEnds: false }
}

export function prepayWhatIf(debt, { extra = 0, monthly = 0, returnPct = 12, pay = 0 } = {}) {
  const flexible = isFlexible(debt)
  const owed = debt.currentOutstanding || 0
  const outstanding = Math.max(0, owed - extra)
  let base, after
  if (flexible) {
    base = simulate(owed, debt.interestRate, pay)
    after = simulate(outstanding, debt.interestRate, pay + monthly)
  } else {
    base = projectSchedule(debt)
    if (outstanding <= 0.005) after = { remaining: 0, totalInterest: 0, endDate: null, neverEnds: false }
    else {
      const emi = (Number(debt.emiAmount) || 0) + monthly
      const d2 = { ...debt, currentOutstanding: outstanding, emiAmount: emi }
      if (Array.isArray(debt.schedule)) d2.schedule = rebuildSchedule({ ...debt, emiAmount: emi }, outstanding)
      after = projectSchedule(d2)
    }
  }
  const interestSaved = base.neverEnds ? 0 : Math.max(0, base.totalInterest - after.totalInterest)
  const monthsCut = base.neverEnds ? 0 : Math.max(0, base.remaining - after.remaining)
  // investing the same money for as long as the loan would otherwise have run
  const n = base.remaining, i = returnPct / 1200
  const lumpGain = i > 0 ? extra * (Math.pow(1 + i, n) - 1) : 0
  const monthlyGain = i > 0 ? monthly * ((Math.pow(1 + i, n) - 1) / i - n) : 0
  const investGain = Math.round(lumpGain + monthlyGain)
  return {
    flexible, base, after, interestSaved: Math.round(interestSaved), monthsCut, investGain, putIn: Math.round(extra + monthly * n),
    better: !(extra > 0 || monthly > 0) || base.neverEnds ? null : interestSaved >= investGain ? 'prepay' : 'invest',
    closes: outstanding <= 0.005,
    interestOnly: Math.ceil(owed * (Number(debt.interestRate) || 0) / 1200),
  }
}
