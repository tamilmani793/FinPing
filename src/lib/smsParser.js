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
    // No currency symbol: "debited amount of 13387", "Deducted 13387", "13387 deducted"
    /(?:debited|credited|deducted|withdrawn)\s+(?:an?\s+)?(?:amount\s+)?(?:of\s+)?(?:by\s+)?([\d,]+(?:\.\d{1,2})?)(?!\d)/i,
    /amount\s+of\s+([\d,]+(?:\.\d{1,2})?)(?!\d)/i,
    /([\d,]+(?:\.\d{1,2})?)\s*(?:has been\s+|is\s+|was\s+)?(?:debited|deducted|credited)/i,
  ]
  for (const p of patterns) {
    const m = text.match(p)
    if (m) return parseFloat(m[1].replace(/,/g, ''))
  }
  return null
}

function extractType(text) {
  const lower = text.toLowerCase()
  // Spend verbs win: "spent Rs.500 ... reward points will be credited" is still a spend.
  const isRefund = /refund|reversal|reversed/.test(lower)
  if (!isRefund && /\b(?:spent|debited|withdrawn|deducted|purchase|txn of|transaction of)\b/.test(lower)) return 'debit'
  if (/cashback|refund|credited|received|reward|points credited|reversal|reversed|\bdeposit(?:ed)?\b|\bcr\b|salary|interest paid/.test(lower)) return 'credit'
  if (/paid/.test(lower)) return 'debit'
  return 'debit'
}

function extractMerchant(text) {
  // Axis style: "Spent Card no. XX1234 INR 500 22-10-26 12:00:00 AMAZON Avl Lmt ..."
  const axis = text.match(/\d{1,2}:\d{2}:\d{2}\s+([A-Z][A-Z0-9 &.\-']{2,30}?)\s+(?:Avl|Available)/i)
  if (axis) return axis[1].trim().replace(/\s+/g, ' ')
  const patterns = [
    /(?:\bat|\bto|\bfor|merchant[:\s])\s+([A-Z][A-Z0-9\s&.\-']{2,30}?)(?:\s+on\s+|\s+Ref|\s+UPI|\s+Avl|\.|$)/i,
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
  const patterns = [
    /\bcard\s*(?:no\.?|number|ending(?:\s+with|\s+in)?)?\s*[:\-]?\s*[xX*.•]*\s*(\d{4})\b/i, // Card x4092, Card no. XX1234, card ending 0123
    /\bending\s+(?:with\s+|in\s+)?(\d{4})\b/i,
    /(?:XX|x{2}|\.{2})[-\s]?(\d{4})/i, // XX1234, XXXX-5279
  ]
  for (const p of patterns) {
    const m = text.match(p)
    if (m) return m[1]
  }
  return null
}

// "Avl Limit Rs.48,701.00" -> 48701
export function extractAvailableLimit(text) {
  const m = text.match(/(?:avl|avail(?:able)?)\.?\s*(?:credit\s*)?(?:limit|lmt|bal(?:ance)?)\s*(?:is|of)?\s*[:\-]?\s*(?:rs\.?|inr|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i)
  return m ? parseFloat(m[1].replace(/,/g, '')) : null
}

function extractAccountLast4(text) {
  // "A/c XX1234", "A/c no. 1234", "Acct *1234", "account ending with 1234"
  const m = text.match(/\b(?:a\/c|a\.c\.?|acct?\.?|account)(?:\s*(?:no\.?|number|ending(?:\s+with|\s+in)?))?[\s:*xX.\-]*(\d{4})\b/i)
  return m ? m[1] : null
}

function extractBank(text) {
  const banks = [
    // Bank names often arrive glued to other words (HDFCBANK, SBICARD, ICICIBK), so only the start is anchored.
    [/\bHDFC/, 'HDFC Bank'], [/\bICICI/, 'ICICI Bank'], [/\bSBI|STATE BANK/, 'State Bank of India'],
    [/\bAXIS/, 'Axis Bank'], [/\bHSBC/, 'HSBC'], [/\bSLICE\b/, 'Slice'], [/\bKOTAK/, 'Kotak Bank'],
    [/\bYES BANK\b/, 'Yes Bank'], [/\bIDFC/, 'IDFC First Bank'], [/\bAU (?:SMALL|BANK)|\bAU SFB\b/, 'AU Small Finance Bank'],
    [/\bINDUSIND/, 'IndusInd Bank'], [/\bPNB\b|PUNJAB NATIONAL/, 'PNB'], [/\bBOB\b|BANK OF BARODA/, 'Bank of Baroda'],
    [/\bCANARA/, 'Canara Bank'], [/\bRBL/, 'RBL Bank'], [/\bAMEX\b|AMERICAN EXPRESS/, 'American Express'],
    [/STANDARD CHARTERED|\bSCB\b/, 'Standard Chartered'], [/\bFEDERAL BANK\b/, 'Federal Bank'],
  ]
  const upper = text.toUpperCase()
  for (const [re, name] of banks) {
    if (re.test(upper)) return name
  }
  return 'Unknown Bank'
}

export function classifyCategory(merchant, text) {
  // No merchant to go by (a bank's own "EMI ... has been debited" alert): the only thing safe to infer is an EMI
  if (!merchant) return /\bemi\b|loan installment|equated monthly/i.test(text || '') ? 'EMI' : 'General'
  const lower = merchant.toLowerCase()
  for (const [key, cat] of Object.entries(MERCHANT_CATEGORY_MAP)) {
    if (lower.includes(key) && cat) return cat
  }
  // Fallback keyword match on full SMS
  const smsLower = text.toLowerCase()
  // Categories that card reward programmes commonly exclude.
  if (/wallet (?:load|top.?up)|add(?:ed)? money|freecharge|mobikwik|paytm wallet/.test(smsLower)) return 'Wallet Load'
  if (/income tax|\bgst\b|challan|municipal|passport|e-?filing|govt|government/.test(smsLower)) return 'Government & Tax'
  if (/school|college|university|tuition|byju|unacademy|education/.test(smsLower)) return 'Education'
  if (/jewel|tanishq|malabar|kalyan|joyalukkas|\bgold\b/.test(smsLower)) return 'Jewellery & Gold'
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
  const kind = detectCardKind(text)
  if (kind) return kind === 'credit' ? 'Credit Card' : kind === 'debit' ? 'Debit Card' : 'Card'
  if (/netbanking|net banking|neft|imps|rtgs/.test(lower)) return 'NetBanking'
  if (/wallet|paytm|phonepe|gpay/.test(lower)) return 'Wallet'
  if (/atm|cash withdrawal/.test(lower)) return 'Cash'
  if (/a\/c|\bac\b|account/.test(lower)) return 'Bank'
  return 'Other'
}

// True only when the SMS is about a credit card, not a savings account or debit card.
// What kind of card an SMS is about:
//   'credit' | 'debit' | 'unknown' (a card, but the SMS does not say which) | null (not a card SMS)
export function detectCardKind(text) {
  const t = text.toLowerCase()
  // Money arriving in a bank account (deposit, salary, NEFT...) is not a card transaction.
  const deposit = /credited (?:to|in|with)|has been credited|is credited|\bdeposit(?:ed)?\b|salary|\bcr\b/.test(t)
  const account = /a\/c|\bac\b|account/.test(t)
  if (deposit && account && !/credit card|debit card|refund|reversal|reversed|cashback/.test(t)) return null
  const debit = /debit card|atm card/.test(t)
  // "Avl limit" / "credit limit" only appear on credit-card SMS.
  const credit = /credit card|\bcc\b|sbi card|slice (?:super )?card|(?:avl|avail(?:able)?)\.?\s*(?:credit\s*)?(?:limit|lmt)|credit limit/.test(t)
  if (credit && !debit) return 'credit'
  if (debit && !credit) return 'debit'
  if (debit && credit) return 'unknown'
  // Only a "card" word, with a spend verb and no account wording: can't tell which kind.
  if (/\bcard\b/.test(t) && /spent|purchase|used|transaction of|txn|paid/.test(t) && !/a\/c|\bac\b|account/.test(t)) return 'unknown'
  return null
}

export const isCreditCardSMS = text => detectCardKind(text) === 'credit'

// Messages that mention an amount but moved no money. These must never become transactions.
//   - OTPs ("OTP is 551974 for txn of INR 278.00") come BEFORE the real payment and may never complete
//   - failed / declined payments
export function isOtpOrFailed(text) {
  const t = text.toLowerCase()
  const moved = /\b(debited|credited|spent|withdrawn|deducted|sent rs)\b/.test(t)
  if (/\botp\b|one[- ]?time (?:password|pin)|verification code/.test(t) && !moved) return true
  if (/\b(failed|declined|unsuccessful|rejected)\b|not (?:been )?(?:successful|completed)|could not be processed/.test(t)) return true
  return false
}

//   - reminders ("payment of Rs.1528 ... is due on 2026-10-21. The amount will be debited")
//   - requests and reward claims ("cashback request ... is being processed", "claimed 10 SuperCoins")
export function isReminderOrRequest(text) {
  const t = text.toLowerCase()
  const done = /\bhas been (?:successfully )?(?:debited|paid|credited)\b|\bsuccessfully (?:debited|paid)\b/.test(t)
  if (!done && /\b(?:is|are|was) due on\b|\bdue on\b|\bdue for payment\b|will be (?:debited|deducted|charged|presented)|\bplease maintain\b|\breminder\b|\bupcoming\b/.test(t)) return true
  // bill / premium / EMI notices: nothing has moved yet, it only asks you to pay
  if (!done && /\b(?:bill|invoice|premium|emi|installment|instalment|dues?)\b[^.]{0,70}\b(?:is |are |was )?(?:due|pending|overdue|payable|unpaid|outstanding|generated)\b|\b(?:pay|paying) (?:by|before|now|on time|your)\b|\bkindly pay\b|\bavoid (?:late|penalty|disconnection)|\blast date\b|\bdue date\b|\bdue by\b|\boverdue\b|\bminimum (?:amount )?due\b|\bunpaid\b/.test(t)) return true
  // offers and promotions ("pre-approved loan of Rs 8,70,000", "limit upgrade", "apply now"): amounts in them are not money that moved
  if (/\bpre-?\s?approved\b|\bpre-?\s?qualified\b|\bloan (?:of|up ?to|offer)\b|\bup ?to (?:rs|inr|₹)|\bapply (?:now|today|here|online)\b|\bclick (?:here|on|the link)\b|\bt&c\b|\bterms (?:and|&) conditions\b|\bexclusive offer\b|\blimit (?:enhancement|increase|upgrade)\b|\bavail (?:now|this|the|a|an)\b|\binstant (?:loan|cash)\b|\bget (?:a |an )?(?:loan|credit line)\b|https?:\/\/|\bbit\.ly\b/.test(t)) return true
  if (/(?:being|currently being) processed|we got your .{0,40}request|request (?:has been |is )?(?:received|raised|submitted)|successfully claimed|supercoins|congratulations/.test(t)) return true
  return false
}

// "SBI Card bill of INR 100.00 paid for Mobile Number-... from your HDFC BANK LTD account (XX2919) using UPI"
// is the CARD ISSUER confirming a bill payment; the bank's own "Sent Rs.100 ..." alert is the debit.
function detectCardBillPaidSMS(text) {
  const m = text.match(/\b([A-Za-z]+(?: [A-Za-z]+)?)\s+card bill of\s*(?:inr|rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)\s+paid/i)
  if (!m) return null
  const issuer = m[1].replace(/^(?:your|the)\s+/i, '')
  return {
    type: 'payment_received',
    billPaid: true,
    amount: parseFloat(m[2].replace(/,/g, '')),
    availableLimit: null,
    cardLast4: null,
    bank: extractBank(issuer),
    paidFromLast4: extractAccountLast4(text),
  }
}

function detectStatementSMS(text) {
  const lower = text.toLowerCase()
  if (/(statement|bill (?:has been )?generated|has been generated|total[\s\S]{0,40}due|minimum[\s\S]{0,20}due|payment due date|closing balance)/.test(lower)) {
    const totalDue = extractAmount(text.match(/total\s*(?:amount|amt)?(?:\s*due)?[:\s]*(?:rs\.?|inr|₹)?\s*[\d,]+(?:\.\d+)?/i)?.[0] || text.match(/total.*?(?:due|amount)[:\s]+([\d,]+\.?\d*)/i)?.[0] || text)
    const minMatch = text.match(/min(?:imum)?\.?\s*(?:amt|amount)?\.?\s*(?:due|payable)?[^\d]{0,14}([\d,]+(?:\.\d+)?)/i)
    const minDue = minMatch ? parseFloat(minMatch[1].replace(/,/g, '')) : null
    const dueDateMatch = text.match(/due\s+date[:\s]+(\d{1,2}\s+\w+\s+\d{4}|\w+\s+\d{1,2},?\s+\d{4}|\d{2}[-\/]\d{2}[-\/]\d{2,4})/i)
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
  if (/(payment received|thank you for.*payment|amount paid|payment of.*(?:received|credited)|received towards your .*card|payment .*(?:has been )?(?:received|credited) .*card)/.test(lower)) {
    return {
      type: 'payment_received',
      amount: extractAmount(text),
      availableLimit: extractAvailableLimit(text),
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
  const cashbackFirst = /(cashback|reward points?|cashpoints?)\s+(?:of\s+)?(?:rs\.?|₹|inr)?\s*[\d,]+/.test(lower)
  // "Rs. 1200 has been credited to your CASHBACK SBI Card account"
  const creditedToCashback = /(?:rs\.?|₹|inr)\s*[\d,]+(?:\.\d+)?\s+has been credited to your cashback/.test(lower)
  if ((cashbackFirst || creditedToCashback) && /(credited|added|earned)/.test(lower)) {
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
// Only messages from a bank, card issuer or payment app are read. Indian senders look like "AX-HDFCBK" / "VM-SBIINB" / "JD-PNBSMS";
// anything else (telecom and utility bills, shops, personal numbers) is ignored. A sender that is not on the list is still accepted
// when the message itself is a bank alert for an account or card ending in four digits.
const BANK_SENDERS = /(hdfc|sbi|icici|axis|kotak|kmb|pnb|punb|indian ?b|indbnk|indb|hsbc|canara|cnrb|baroda|bobsms|bob|union|ubi|yes ?b|idfc|idbi|bandhan|federal|fedbnk|rbl|ausfb|stanc|scb|citi|amex|dbs|sibank|kvb|tmb|cub|uco|boi|cbi|iob|jkb|bom|psb|nainital|karnataka|dhanlaxmi|equitas|ujjivan|jana|esaf|paytm|phonepe|gpay|cred|slice|onecard|jupiter|npci|sbicrd|bankofindia|bank)/i
const looksLikeAccountAlert = text => /\b(?:a\/c|acct?|account|card|ac)\b[^.]{0,25}(?:[x*]{2,}|ending|no\.?)\s*[\dxX*]*\d{3,4}\b/i.test(text) && /\b(?:debited|credited|spent|withdrawn|deposited|paid|received|transferred|sent)\b/i.test(text)
export function isBankSender(sender, text = '') {
  const s = String(sender || '').trim()
  if (!s) return true // unknown / pasted text: nothing to judge by
  const header = s.replace(/^[A-Za-z]{2}[-_]/, '')
  if (BANK_SENDERS.test(header)) return true
  return looksLikeAccountAlert(text)
}

export function parseSMS(rawText, sender = '', receivedAt = new Date()) {
  if (!rawText || rawText.length < 20) return null
  if (!isBankSender(sender, rawText)) return null

  // Check for known financial sender patterns
  const senderUpper = sender.toUpperCase()
  const knownSenders = ['HDFCBK', 'SBICARD', 'ICICIBK', 'AXISBK', 'KOTAKBK', 'YESBANK', 'IDFCBK', 'PAYTM', 'NPCI', 'HDFC', 'ICICI', 'SBI', 'AXIS']
  const isKnownSender = knownSenders.some(s => senderUpper.includes(s))

  // Quick exit for non-financial SMS (only filter if sender is known to be non-bank)
  const hasFinancialKeywords = /(?:rs\.?|inr|₹|debited|deducted|credited|spent|cashback|emi|sip|mutual fund|statement|payment due|payment alert)/i.test(rawText)
  if (!hasFinancialKeywords) return null

  // OTPs and failed payments are not transactions at all
  if (isOtpOrFailed(rawText)) return null

  // Check specialised SMS types first
  const statementResult = detectStatementSMS(rawText)
  if (statementResult) return { ...statementResult, rawText, sender, receivedAt, confidence: 0.9 }

  // Reminders ("...is due on...") and requests / reward claims moved no money either
  if (isReminderOrRequest(rawText)) return null

  const billPaid = detectCardBillPaidSMS(rawText)
  if (billPaid) return { ...billPaid, rawText, sender, receivedAt, confidence: 0.9 }

  const paymentResult = detectPaymentReceivedSMS(rawText)
  if (paymentResult) return { ...paymentResult, rawText, sender, receivedAt, confidence: 0.9 }

  // Loans are NOT tracked from SMS (EMIs post themselves on their due date from the loan's schedule).
  //  - "EMI of Rs.24,800 ... has been debited" is just a debit on the bank account: it falls through to the normal transaction below
  //  - EMI offers and information ("convert to EMI", "EMI facility") carry no money movement
  if (detectEMISMS(rawText) && !/\b(debited|deducted|paid)\b/i.test(rawText)) return null

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
    availableLimit: extractAvailableLimit(rawText),
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
