// Suggestions for the card edit form. Every field also accepts free text.

export const CARD_TYPES = [
  { id: 'credit', label: 'Credit card' },
  { id: 'debit', label: 'Debit card' },
  { id: 'account', label: 'Bank account' },
]

export const BANKS = [
  'HDFC Bank', 'ICICI Bank', 'State Bank of India', 'HSBC', 'Axis Bank', 'Slice',
  'Kotak Bank', 'IDFC First Bank', 'Yes Bank', 'IndusInd Bank', 'RBL Bank',
  'AU Small Finance Bank', 'American Express', 'Standard Chartered', 'Federal Bank', 'Bank of Baroda', 'PNB',
]

export const NETWORKS = ['Visa', 'Mastercard', 'RuPay', 'American Express', 'Diners Club']

const CREDIT_VARIANTS = {
  Visa: ['Signature', 'Infinite', 'Infinia', 'Platinum', 'Gold', 'Classic', 'Titanium', 'Select', 'Business'],
  Mastercard: ['World Elite', 'World', 'Platinum', 'Titanium', 'Gold', 'Standard', 'Business'],
  RuPay: ['Select', 'Platinum', 'Classic', 'Signature'],
  'American Express': ['Platinum', 'Gold', 'SmartEarn', 'Membership Rewards', 'Platinum Travel', 'Centurion'],
  'Diners Club': ['Black', 'Premium', 'Privilege', 'ClubMiles', 'Rewardz'],
}

const DEBIT_VARIANTS = {
  Visa: ['Classic', 'Platinum', 'Signature', 'Gold', 'Business', 'Rewards'],
  Mastercard: ['Standard', 'Platinum', 'World', 'Titanium', 'Business'],
  RuPay: ['Classic', 'Platinum', 'Select'],
  'American Express': [],
  'Diners Club': [],
}

export function variantsFor(network, cardType) {
  const table = cardType === 'debit' ? DEBIT_VARIANTS : CREDIT_VARIANTS
  return network && table[network] ? table[network] : [...new Set(Object.values(table).flat())]
}

// Popular card names by issuer, used to suggest the card name.
export const CARD_NAMES = {
  'HDFC Bank': ['Infinia', 'Diners Club Black', 'Regalia Gold', 'Regalia', 'Millennia', 'MoneyBack+', 'Swiggy', 'Tata Neu Infinity', 'Pixel', 'IndianOil', 'Freedom', 'Rupay Credit'],
  'ICICI Bank': ['Amazon Pay', 'Sapphiro', 'Coral', 'Rubyx', 'Emeralde', 'HPCL Super Saver', 'MakeMyTrip', 'Platinum Chip'],
  'State Bank of India': ['Cashback', 'SimplyCLICK', 'SimplySAVE', 'Elite', 'PRIME', 'PhonePe Black', 'PhonePe Purple', 'BPCL Octane', 'IRCTC'],
  HSBC: ['Premier', 'Cashback', 'Live+', 'Travel One', 'Visa Platinum'],
  'Axis Bank': ['Magnus', 'Atlas', 'Reserve', 'Flipkart', 'Ace', 'Airtel', 'Myzone', 'Neo', 'Select', 'Privilege'],
  Slice: ['Slice Super Card', 'Slice Credit Card'],
  'Kotak Bank': ['811', 'Royale Signature', 'League Platinum', 'Zen Signature', 'Myntra'],
  'IDFC First Bank': ['Wealth', 'Select', 'Millennia', 'Classic', 'Ashva'],
  'Yes Bank': ['Reserv', 'Marquee', 'Paisabazaar', 'Ace'],
  'IndusInd Bank': ['Legend', 'Platinum Aura Edge', 'Tiger', 'EazyDiner'],
  'RBL Bank': ['Shoprite', 'Platinum Maxima', 'Bajaj Finserv', 'Play'],
  'American Express': ['Platinum Charge', 'Platinum Travel', 'Gold Charge', 'SmartEarn', 'MRCC'],
}

// Third-party / co-branded card partners.
export const PARTNERS = [
  'Amazon Pay', 'Flipkart', 'Swiggy', 'PhonePe', 'Paytm', 'Tata Neu', 'Myntra', 'Airtel', 'BookMyShow',
  'MakeMyTrip', 'IndianOil', 'BPCL', 'HPCL', 'IRCTC', 'Marriott', 'Vistara', 'Air India', 'Zomato', 'OneCard', 'Jupiter', 'CRED',
]

export const typeLabel = c => (c?.cardType === 'debit' ? 'Debit' : c?.cardType === 'account' ? 'Bank account' : c?.cardType === 'unknown' ? 'Type not set' : 'Credit')

// "Visa Signature" / "Mastercard" / ""
export const networkLabel = c => [c?.network, c?.variant].filter(Boolean).join(' ')

// Spends in these categories are commonly left out of cashback / reward points. The real list
// differs per card, so each card keeps its own editable list; this is only the starting point.
export const EXCLUSION_CATEGORIES = [
  'Fuel', 'Rent', 'Utilities & Bills', 'Insurance', 'EMI', 'Wallet Load', 'Government & Tax',
  'Education', 'Jewellery & Gold', 'Investment', 'UPI Scan & Pay', 'ATM Withdrawal', 'Fees & Charges', 'Gaming & Gambling',
]
export const DEFAULT_EXCLUSIONS = ['Fuel', 'Rent', 'Wallet Load', 'Government & Tax', 'Insurance', 'Jewellery & Gold']
export const excludedFor = card => (Array.isArray(card?.excludedCategories) ? card.excludedCategories : DEFAULT_EXCLUSIONS)

// ── how a card or account is named everywhere: "HDFC Savings account ••2919", "HDFC Regalia Gold ••4321" ──
const BRANDS = {
  'HDFC Bank': 'HDFC', 'ICICI Bank': 'ICICI', 'State Bank of India': 'SBI', 'Axis Bank': 'Axis', 'Kotak Bank': 'Kotak', 'Kotak Mahindra Bank': 'Kotak',
  'IDFC First Bank': 'IDFC First', 'Yes Bank': 'Yes Bank', 'IndusInd Bank': 'IndusInd', 'Bank of Baroda': 'BoB', 'Punjab National Bank': 'PNB', PNB: 'PNB',
  'Federal Bank': 'Federal', 'Standard Chartered': 'Standard Chartered', 'RBL Bank': 'RBL', 'AU Small Finance Bank': 'AU', 'American Express': 'Amex',
}
// "HDFC Bank" -> "HDFC", "State Bank of India" -> "SBI", anything else: the name without a trailing "Bank"
export const bankBrand = bank => {
  const b = String(bank || '').trim()
  return BRANDS[b] || b.replace(/\s+bank$/i, '').trim()
}
// The name with the bank in front when it is missing, and the last four digits at the end.
export function cardTitle(card, { last4 = true } = {}) {
  if (!card) return ''
  const base = String(card.name || '').replace(/\s*••\s*\d{2,4}\s*$/, '').trim()
  const brand = bankBrand(card.bank)
  const low = base.toLowerCase()
  const hasBank = brand && (low.includes(brand.toLowerCase()) || (card.bank && low.includes(String(card.bank).toLowerCase())))
  const title = !brand ? base : !base ? `${brand} ${card.cardType === 'account' ? 'account' : card.cardType === 'debit' ? 'debit card' : 'credit card'}` : hasBank ? base : `${brand} ${base}`
  return last4 && card.cardLast4 ? `${title} ••${card.cardLast4}` : title
}
