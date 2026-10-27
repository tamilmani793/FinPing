import { addMonths, startOfDay } from 'date-fns'

export const POLICY_TYPES = [
  'Term insurance', 'LIC endowment / money-back', 'ULIP', 'Whole life', 'Health insurance',
  'Vehicle insurance', 'Home insurance', 'Personal accident', 'Other',
]

export const INSURERS = [
  'LIC', 'HDFC Life', 'ICICI Prudential', 'SBI Life', 'Max Life', 'Tata AIA', 'Bajaj Allianz', 'Kotak Life',
  'Aditya Birla Sun Life', 'PNB MetLife', 'Star Health', 'Care Health', 'HDFC ERGO', 'ICICI Lombard', 'New India Assurance',
]

// months between two premiums
export const FREQUENCIES = [
  { id: 'monthly', label: 'Monthly', months: 1 },
  { id: 'quarterly', label: 'Quarterly', months: 3 },
  { id: 'half-yearly', label: 'Half-yearly', months: 6 },
  { id: 'yearly', label: 'Yearly', months: 12 },
]
const monthsOf = id => FREQUENCIES.find(f => f.id === id)?.months || 12
export const freqLabel = id => FREQUENCIES.find(f => f.id === id)?.label || 'Yearly'

// A policy's cost per month, whatever its payment frequency (a yearly premium of 12,000 is 1,000 a month).
export const monthlyEquivalent = p => (p.premium || 0) / monthsOf(p.frequency)

// A policy still counts while it is active and its term has not ended.
export const isLive = (p, now = new Date()) => p.status !== 'closed' && !(p.endDate && new Date(p.endDate) < startOfDay(now))

// Moves the due date on by one payment period (after a premium is paid).
export const advanceDue = (date, frequency) => addMonths(new Date(date), monthsOf(frequency))

// "Overdue" when the due date has passed without the premium being marked paid.
export const dueState = (p, now = new Date()) => {
  if (!p.nextDueDate) return 'unset'
  const d = startOfDay(new Date(p.nextDueDate))
  const today = startOfDay(now)
  if (d < today) return 'overdue'
  return 'upcoming'
}
