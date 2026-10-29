import { addMonths, startOfDay } from 'date-fns'

export const POLICY_TYPES = [
  'Term insurance', 'LIC endowment / money-back', 'ULIP', 'Whole life', 'Health insurance',
  'Vehicle insurance', 'Home insurance', 'Personal accident', 'Other',
]

export const INSURERS = [
  'LIC', 'HDFC Life', 'ICICI Prudential', 'SBI Life', 'Max Life', 'Tata AIA', 'Bajaj Allianz', 'Kotak Life',
  'Aditya Birla Sun Life', 'PNB MetLife', 'Star Health', 'Care Health', 'HDFC ERGO', 'ICICI Lombard', 'New India Assurance',
  'Niva Bupa', 'Bajaj Allianz General', 'Tata AIG', 'Digit', 'Acko', 'Reliance General', 'SBI General', 'National Insurance', 'Oriental Insurance',
  'United India Insurance', 'Royal Sundaram', 'Chola MS', 'Manipal Cigna',
]

// Vehicle policies are either Comprehensive (own damage + third party) or Third party only.
export const VEHICLE_TYPE = 'Vehicle insurance'
export const COVER_TYPES = ['Comprehensive', 'Third party']

// Well-known policies: choosing one in the form fills in the insurer and the policy type (and the cover for a vehicle).
// [full name, insurer, policy type, cover (vehicle only)]
const T = 'Term insurance', E = 'LIC endowment / money-back', U = 'ULIP', W = 'Whole life', H = 'Health insurance', V = 'Vehicle insurance', A = 'Personal accident', O = 'Other', HM = 'Home insurance'
export const POLICY_CATALOG = [
  ['LIC Jeevan Anand', 'LIC', E], ['LIC Jeevan Umang', 'LIC', W], ['LIC New Endowment Plan', 'LIC', E], ['LIC Jeevan Labh', 'LIC', E], ['LIC Jeevan Lakshya', 'LIC', E],
  ['LIC Bima Jyoti', 'LIC', E], ['LIC Money Back 20 Years', 'LIC', E], ['LIC Tech Term', 'LIC', T], ['LIC Jeevan Amar', 'LIC', T], ['LIC Jeevan Utsav', 'LIC', W],
  ['HDFC Life Click 2 Protect Life', 'HDFC Life', T], ['HDFC Life Sanchay Plus', 'HDFC Life', O], ['HDFC Life Click 2 Invest', 'HDFC Life', U],
  ['ICICI Pru iProtect Smart', 'ICICI Prudential', T], ['ICICI Pru Signature', 'ICICI Prudential', U], ['ICICI Pru GIFT Pro', 'ICICI Prudential', O],
  ['SBI Life eShield Next', 'SBI Life', T], ['SBI Life Smart Shield', 'SBI Life', T], ['SBI Life Saral Jeevan Bima', 'SBI Life', T], ['SBI Life Smart Platina Assure', 'SBI Life', O],
  ['Max Life Smart Secure Plus', 'Max Life', T], ['Max Life Online Savings Plan', 'Max Life', O], ['Tata AIA Sampoorna Raksha Supreme', 'Tata AIA', T], ['Tata AIA Fortune Guarantee Plus', 'Tata AIA', O],
  ['Bajaj Allianz eTouch', 'Bajaj Allianz', T], ['Kotak e-Term', 'Kotak Life', T], ['Aditya Birla Sun Life DigiShield', 'Aditya Birla Sun Life', T], ['PNB MetLife Mera Term Plan', 'PNB MetLife', T],
  ['Star Family Health Optima', 'Star Health', H], ['Star Comprehensive', 'Star Health', H], ['Star Senior Citizens Red Carpet', 'Star Health', H], ['Star Young Star', 'Star Health', H],
  ['Care Supreme', 'Care Health', H], ['Care Advantage', 'Care Health', H], ['Care Senior', 'Care Health', H],
  ['HDFC ERGO Optima Secure', 'HDFC ERGO', H], ['HDFC ERGO Optima Restore', 'HDFC ERGO', H], ['HDFC ERGO my:health Suraksha', 'HDFC ERGO', H],
  ['ICICI Lombard Complete Health', 'ICICI Lombard', H], ['ICICI Lombard Elevate', 'ICICI Lombard', H], ['ICICI Lombard Health Booster', 'ICICI Lombard', H],
  ['New India Mediclaim Policy', 'New India Assurance', H], ['New India Floater Mediclaim', 'New India Assurance', H], ['Niva Bupa ReAssure 2.0', 'Niva Bupa', H], ['Niva Bupa Health Premia', 'Niva Bupa', H],
  ['ICICI Lombard Car Insurance', 'ICICI Lombard', V, 'Comprehensive'], ['ICICI Lombard Two Wheeler Insurance', 'ICICI Lombard', V, 'Comprehensive'],
  ['HDFC ERGO Car Insurance', 'HDFC ERGO', V, 'Comprehensive'], ['HDFC ERGO Two Wheeler Insurance', 'HDFC ERGO', V, 'Comprehensive'],
  ['Bajaj Allianz Private Car Package', 'Bajaj Allianz General', V, 'Comprehensive'], ['Bajaj Allianz Two Wheeler Package', 'Bajaj Allianz General', V, 'Comprehensive'],
  ['New India Private Car Policy', 'New India Assurance', V, 'Comprehensive'], ['New India Two Wheeler Policy', 'New India Assurance', V, 'Comprehensive'],
  ['Digit Car Insurance', 'Digit', V, 'Comprehensive'], ['Digit Two Wheeler Insurance', 'Digit', V, 'Comprehensive'], ['Acko Car Insurance', 'Acko', V, 'Comprehensive'], ['Acko Bike Insurance', 'Acko', V, 'Comprehensive'],
  ['Tata AIG AutoSecure', 'Tata AIG', V, 'Comprehensive'], ['Reliance General Private Car Package', 'Reliance General', V, 'Comprehensive'], ['SBI General Car Insurance', 'SBI General', V, 'Comprehensive'],
  ['United India Private Car Policy', 'United India Insurance', V, 'Comprehensive'], ['National Insurance Private Car Policy', 'National Insurance', V, 'Comprehensive'], ['Oriental Insurance Two Wheeler Policy', 'Oriental Insurance', V, 'Comprehensive'],
  ['HDFC ERGO Bharat Griha Raksha', 'HDFC ERGO', HM], ['New India Bharat Griha Raksha', 'New India Assurance', HM],
  ['ICICI Lombard Personal Accident', 'ICICI Lombard', A], ['Bajaj Allianz Personal Guard', 'Bajaj Allianz General', A], ['HDFC ERGO Personal Accident', 'HDFC ERGO', A],
].map(([name, insurer, type, cover]) => ({ name, insurer, type, ...(cover ? { cover } : {}) }))

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
