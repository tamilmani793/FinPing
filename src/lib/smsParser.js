// FinPing — SMS Parser Engine
// Handles Indian bank SMS patterns from 15+ banks

const MERCHANT_CATEGORY_MAP = {
  swiggy: 'Food Delivery', zomato: 'Food Delivery', dominos: 'Food Delivery',
  blinkit: 'Grocery', bigbasket: 'Grocery', zepto: 'Grocery', dmart: 'Grocery',
  reliance: 'Grocery', jiomart: 'Grocery', dunzo: 'Grocery',
  uber: 'Transport', ola: 'Transport', rapido: 'Transport', yulu: 'Transport',
  irctc: 'Travel Online', makemytrip: 'Travel Online', cleartrip: 'Travel Online', goibibo: 'Travel Online',
  hpcl: 'Fuel', iocl: 'Fuel', bpcl: 'Fuel', indianoil: 'Fuel', hp: 'Fuel', shell: 'Fuel',
  amazon: 'E-Commerce', flipkart: 'E-Commerce', meesho: 'E-Commerce',
  myntra: 'E-Commerce', ajio: 'E-Commerce', nykaa: 'E-Commerce', tatacliq: 'E-Commerce',
  netflix: 'Entertainment', spotify: 'Entertainment', hotstar: 'Entertainment',
  sonyliv: 'Entertainment', bookmyshow: 'Entertainment', pvr: 'Entertainment', inox: 'Entertainment',
  airtel: 'Utilities & Bills', jio: 'Utilities & Bills', bsnl: 'Utilities & Bills',
  bescom: 'Utilities & Bills', msedcl: 'Utilities & Bills', tata: 'Utilities & Bills',
  pharmeasy: 'Health', netmeds: 'Health', apollo: 'Health',
  lic: 'Insurance', hdfc: null, icici: null, sbi: null, axis: null,
}

function extractAmount(text) {
  const patterns = [
    /(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,
    /(?:debited|credited|spent|paid|withdrawn)\s+(?:by\s+)?(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,
    /([\d,]+(?:\.\d{2}))\s*(?:has been|is|was)\s+(?:debited|credited)/i,
  ]
  for (const p of patterns) {
    const m = text.match(p)
    if (m) return parseFloat(m[1].replace(/,/g, ''))
  }
  return null
}

function extractType(text) {
  const lower = text.toLowerCase()
  if (/cashback|refund|credited|received|reward|points credited/.test(lower)) return 'credit'
  if (/debited|spent|paid|withdrawn|deducted|purchase/.test(lower)) return 'debit'
  return 'debit'
}

function extractMerchant(text) {
  const patterns = [
    /(?:at|to|for|merchant[:\s])\s+([A-Z][A-Z0-9\s&.\-']{2,30}?)(?:\s+on\s+|\s+Ref|\s+UPI|\s+Avl|\.|$)/i,
    /(?:transfer\s+to|payment\s+to)\s+([A-Z][A-Z0-9\s&.\-']{2,30}?)(?:\s+Ref|\.|$)/i,
    /(?:towards)\s+([A-Z][A-Z0-9\s&.\-']{2,30}?)(?:\s+a\/c|\s+Ref|\.|$)/i,
  ]
  for (const p of patterns) {
    const m = text.match(p)
    if (m) return m[1].trim().replace(/\s+/g, ' ')
  }
  return null
}

function extractCardLast4(text) {
  const m = text.match(/(?:XX|x{2}|\.{2}|card[:\s]+)(\d{4})/i)
  return m ? m[1] : null
}

function extractAccountLast4(text) {
  const m = text.match(/(?:a\/c|ac|account|A\/C)[:\s*X]*(\d{4})/i)
  return m ? m[1] : null
}

function extractBank(text) {
  const banks = { 'HDFC': 'HDFC Bank', 'ICICI': 'ICICI Bank', 'SBI': 'State Bank of India', 'AXIS': 'Axis Bank', 'KOTAK': 'Kotak Bank', 'YES': 'Yes Bank', 'IDFC': 'IDFC First Bank', 'AU': 'AU Small Finance Bank', 'INDUSIND': 'IndusInd Bank', 'PNB': 'PNB', 'BOB': 'Bank of Baroda', 'CANARA': 'Canara Bank', 'RBL': 'RBL Bank' }
  const upper = text.toUpperCase()
  for (const [k, v] of Object.entries(banks)) {
    if (upper.includes(k)) return v
  }
  return 'Unknown Bank'
}

function classifyCategory(merchant, text) {
  if (!merchant) return 'General'
  const lower = merchant.toLowerCase()
  for (const [key, cat] of Object.entries(MERCHANT_CATEGORY_MAP)) {
    if (lower.includes(key) && cat) return cat
  }
  // Fallback keyword match on full SMS
  const smsLower = text.toLowerCase()
  if (/rent|house|flat|pg/.test(smsLower)) return 'Rent'
  if (/emi|loan installment|equated/.test(smsLower)) return 'EMI'
  if (/insurance|premium|policy/.test(smsLower)) return 'Insurance'
  if (/fuel|petrol|diesel/.test(smsLower)) return 'Fuel'
  if (/electricity|water|gas|bill|utility/.test(smsLower)) return 'Utilities & Bills'
  if (/upi|scan|qr/.test(smsLower)) return 'UPI Scan & Pay'
  if (/sip|mutual fund|nav|units allotted/.test(smsLower)) return 'Investment'
  return 'General'
}

function detectPaymentMode(text) {
  const lower = text.toLowerCase()
  if (/upi|upi ref|upi:/.test(lower)) return 'UPI'
  if (/credit card|debit card|card xx|card x{2}/.test(lower)) return isCreditCardSMS(text) ? 'Credit Card' : 'Debit Card'
  if (/netbanking|net banking|neft|imps|rtgs/.test(lower)) return 'NetBanking'
  if (/wallet|paytm|phonepe|gpay/.test(lower)) return 'Wallet'
  if (/atm|cash withdrawal/.test(lower)) return 'Cash'
  if (/a\/c|\bac\b|account/.test(lower)) return 'Bank'
  return 'Other'
}

// True only when the SMS is about a credit card, not a savings account or debit card.
export function isCreditCardSMS(text) {
  const t = text.toLowerCase()
  if (/debit card|a\/c|\bac\b|account|upi/.test(t) && !/credit card/.test(t)) return false
  return /credit card|\bcc\b|sbi card|card\s*(?:no\.?)?\s*x{2,}\d{4}|card\s*ending/.test(t)
}

function detectStatementSMS(text) {
  const lower = text.toLowerCase()
  if (/(statement|bill generated|total.*due|minimum.*due|payment due date|closing balance)/.test(lower)) {
    const totalDue = extractAmount(text.match(/total.*?(?:due|amount)[:\s]+([\d,]+\.?\d*)/i)?.[0] || text)
    const minDue = extractAmount(text.match(/min.*?(?:due|amount)[:\s]+([\d,]+\.?\d*)/i)?.[0] || '')
    const dueDateMatch = text.match(/due\s+date[:\s]+(\d{1,2}\s+\w+\s+\d{4}|\d{2}[-\/]\d{2}[-\/]\d{2,4})/i)
    return {
      type: 'statement',
      totalDue: totalDue || extractAmount(text),
      minimumDue: minDue,
      dueDate: dueDateMatch ? dueDateMatch[1] : null,
      cardLast4: extractCardLast4(text),
      bank: extractBank(text),
    }
  }
  return null
}

function detectPaymentReceivedSMS(text) {
  const lower = text.toLowerCase()
  if (/(payment received|thank you for.*payment|amount paid|payment of.*received)/.test(lower)) {
    return {
      type: 'payment_received',
      amount: extractAmount(text),
      cardLast4: extractCardLast4(text),
      bank: extractBank(text),
    }
  }
  return null
}

function detectEMISMS(text) {
  const lower = text.toLowerCase()
  if (/(emi|loan installment|equated monthly)/.test(lower)) {
    return {
      type: 'emi',
      amount: extractAmount(text),
      bank: extractBank(text),
      accountLast4: extractAccountLast4(text),
      outstanding: extractAmount(text.match(/outstanding[:\s]+([\d,]+\.?\d*)/i)?.[0] || ''),
    }
  }
  return null
}

function detectInvestmentSMS(text) {
  const lower = text.toLowerCase()
  if (/(sip|mutual fund|nav of|units allotted|folio)/.test(lower)) {
    const navMatch = text.match(/nav[:\s]+([\d.]+)/i)
    const unitsMatch = text.match(/units[:\s]+allotted[:\s]+([\d.]+)/i)
    const folioMatch = text.match(/folio[:\s#:]+(\d+)/i)
    return {
      type: 'investment_sip',
      amount: extractAmount(text),
      nav: navMatch ? parseFloat(navMatch[1]) : null,
      units: unitsMatch ? parseFloat(unitsMatch[1]) : null,
      folio: folioMatch ? folioMatch[1] : null,
      bank: extractBank(text),
    }
  }
  if (/(fixed deposit|fd of|fd no)/.test(lower)) {
    return { type: 'investment_fd', amount: extractAmount(text), bank: extractBank(text) }
  }
  return null
}

function detectCashbackSMS(text) {
  const lower = text.toLowerCase()
  if (/(cashback|reward points?|cashpoints?)\s+(?:of\s+)?(?:rs\.?|₹|inr)?\s*[\d,]+/.test(lower) &&
      /(credited|added|earned)/.test(lower)) {
    return {
      type: 'cashback_credited',
      amount: extractAmount(text),
      cardLast4: extractCardLast4(text),
      bank: extractBank(text),
    }
  }
  return null
}

// ── Main parse function ────────────────────────────────────────────────────
export function parseSMS(rawText, sender = '', receivedAt = new Date()) {
  if (!rawText || rawText.length < 20) return null

  // Check for known financial sender patterns
  const senderUpper = sender.toUpperCase()
  const knownSenders = ['HDFCBK', 'SBICARD', 'ICICIBK', 'AXISBK', 'KOTAKBK', 'YESBANK', 'IDFCBK', 'PAYTM', 'NPCI', 'HDFC', 'ICICI', 'SBI', 'AXIS']
  const isKnownSender = knownSenders.some(s => senderUpper.includes(s))

  // Quick exit for non-financial SMS (only filter if sender is known to be non-bank)
  const hasFinancialKeywords = /(?:rs\.?|inr|₹|debited|credited|spent|cashback|emi|sip|mutual fund|statement|payment due)/i.test(rawText)
  if (!hasFinancialKeywords) return null

  // Check specialised SMS types first
  const statementResult = detectStatementSMS(rawText)
  if (statementResult) return { ...statementResult, rawText, sender, receivedAt, confidence: 0.9 }

  const paymentResult = detectPaymentReceivedSMS(rawText)
  if (paymentResult) return { ...paymentResult, rawText, sender, receivedAt, confidence: 0.9 }

  const emiResult = detectEMISMS(rawText)
  if (emiResult) return { ...emiResult, rawText, sender, receivedAt, confidence: 0.85 }

  const investResult = detectInvestmentSMS(rawText)
  if (investResult) return { ...investResult, rawText, sender, receivedAt, confidence: 0.88 }

  const cashbackResult = detectCashbackSMS(rawText)
  if (cashbackResult) return { ...cashbackResult, rawText, sender, receivedAt, confidence: 0.92 }

  // Standard debit/credit transaction
  const amount = extractAmount(rawText)
  if (!amount) return null

  const type = extractType(rawText)
  const merchant = extractMerchant(rawText)
  const cardLast4 = extractCardLast4(rawText)
  const accountLast4 = extractAccountLast4(rawText)
  const bank = extractBank(rawText)
  const category = classifyCategory(merchant, rawText)
  const paymentMode = detectPaymentMode(rawText)

  // Confidence scoring
  let confidence = 0.5
  if (amount) confidence += 0.2
  if (merchant) confidence += 0.15
  if (cardLast4 || accountLast4) confidence += 0.1
  if (isKnownSender) confidence += 0.05

  return {
    type: 'transaction',
    transactionType: type,
    amount,
    merchant: merchant || 'Unknown',
    category,
    paymentMode,
    bank,
    cardLast4,
    accountLast4,
    rawText,
    sender,
    receivedAt,
    confidence: Math.min(confidence, 0.99),
  }
}

// ── Batch parse ─────────────────────────────────────────────────────────────
export function parseBatch(smsList) {
  return smsList
    .map(({ text, sender, timestamp }) => parseSMS(text, sender, timestamp ? new Date(timestamp) : new Date()))
    .filter(Boolean)
}

export { MERCHANT_CATEGORY_MAP }
