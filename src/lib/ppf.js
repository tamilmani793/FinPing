// PPF rules: at most ₹1,50,000 deposited per financial year (Apr-Mar). Interest is worked out each month on the
// LOWEST balance between the 5th and the month end (so a deposit made after the 5th earns from next month),
// and is credited once, on 31 March.
export const PPF_LIMIT = 150000
export const PPF_RATE = 7.1

const fyStartYear = d => (d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1)
export const fyLabel = y => `${y}-${String(y + 1).slice(2)}`

// entries: the logged deposits ({date, amount, opening?}); current: the balance you last entered (before this year's interest).
// Returns this financial year's deposits against the limit, and the interest earned so far and projected for the whole year.
export function ppfYear({ entries = [], current = 0, rate = PPF_RATE, now = new Date() }) {
  const y = fyStartYear(now)
  const dep = entries.filter(e => !e.opening && fyStartYear(new Date(e.date)) === y).map(e => ({ d: new Date(e.date), a: e.amount }))
  const deposited = dep.reduce((s, e) => s + e.a, 0)
  const opening = Math.max(0, current - deposited) // what was there before this year's deposits
  let bal = opening, soFar = 0, projected = 0
  const months = []
  for (let i = 0; i < 12; i++) {
    const monthStart = new Date(y, 3 + i, 1)
    // deposits up to the 5th count for this month; later ones are added after the month's interest is worked out
    const early = dep.filter(e => e.d.getFullYear() === monthStart.getFullYear() && e.d.getMonth() === monthStart.getMonth() && e.d.getDate() <= 5).reduce((s, e) => s + e.a, 0)
    const late = dep.filter(e => e.d.getFullYear() === monthStart.getFullYear() && e.d.getMonth() === monthStart.getMonth() && e.d.getDate() > 5).reduce((s, e) => s + e.a, 0)
    bal += early
    const interest = Math.round(bal * rate / 1200 * 100) / 100
    months.push({ month: monthStart, balance: bal, interest })
    projected += interest
    if (monthStart <= now) soFar += interest
    bal += late
  }
  return { fy: fyLabel(y), deposited, limit: PPF_LIMIT, remaining: Math.max(0, PPF_LIMIT - deposited), over: Math.max(0, deposited - PPF_LIMIT), soFar: Math.round(soFar), projected: Math.round(projected), months }
}

// the rate for a financial year: the one you set for that year, else the account's rate, else the default
export const ppfRateFor = (inv, fy) => inv.ppfRates?.[fy] ?? inv.ppfRate ?? PPF_RATE

// Year by year: deposits, rate, interest (the passbook figure if you entered it, else worked out) and closing balance.
// The opening amount is taken as the balance at the start of the earliest year with entries.
// the logged deposits; an account created with just an invested amount counts that amount as its opening balance
export const ppfEntries = inv => inv.entries || (inv.investedAmount ? [{ date: inv.startDate || new Date(), amount: inv.investedAmount, opening: true }] : [])
export function ppfHistory(inv, now = new Date()) {
  const entries = ppfEntries(inv)
  const real = entries.filter(e => !e.opening)
  const opening = entries.filter(e => e.opening).reduce((s, e) => s + e.amount, 0)
  const nowY = fyStartYear(now)
  const first = Math.min(nowY, ...real.map(e => fyStartYear(new Date(e.date))), ...entries.filter(e => e.opening).map(e => fyStartYear(new Date(e.date))))
  const rows = []
  let carry = opening
  for (let y = first; y <= nowY; y++) {
    const fy = fyLabel(y), rate = ppfRateFor(inv, fy)
    const r = ppfYear({ entries: real, current: carry + real.filter(e => fyStartYear(new Date(e.date)) === y).reduce((s, e) => s + e.amount, 0), rate, now: y === nowY ? now : new Date(y + 1, 2, 31) })
    const actual = inv.ppfInterest?.[fy]
    const current = y === nowY
    const interest = actual ?? (current ? r.soFar : r.projected)
    rows.push({ fy, rate, pct: carry + r.deposited > 0 ? (interest / (carry + r.deposited)) * 100 : null, deposited: r.deposited, over: r.over, interest, actual: actual != null, current, computed: current ? r.soFar : r.projected, closing: carry + r.deposited + (current && actual == null ? 0 : interest) })
    carry = rows[rows.length - 1].closing
  }
  return rows
}

// What a PPF account is worth now: everything deposited plus the interest credited on 31 March of each year that has ended.
// This year's interest is not part of it until the bank credits it (enter the passbook figure in the year table once it is).
export function ppfCurrent(inv, now = new Date()) {
  const rows = ppfHistory(inv, now)
  return rows.length ? rows[rows.length - 1].closing : 0
}
