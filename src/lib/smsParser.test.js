// SMS Parser Unit Tests
// Run with: node --experimental-vm-modules node_modules/.bin/jest src/lib/smsParser.test.js

import { parseSMS } from './smsParser.js'

const TEST_SMS = [
  {
    label: 'HDFC Credit Card Debit',
    text: 'Rs.1,299.00 spent on HDFC Bank Credit Card XX4092 at AMAZON on 22-Oct-26:10:30. Avl Limit:Rs.48,701.00',
    expect: { type: 'transaction', amount: 1299, merchant: 'AMAZON', category: 'E-Commerce', cardLast4: '4092', bank: 'HDFC Bank' }
  },
  {
    label: 'HDFC Card x-format',
    text: 'Rs.1,299.00 spent on HDFC Bank Card x4092 at AMAZON on 22-Oct-26. Avl Limit Rs.48,701.00',
    expect: { type: 'transaction', transactionType: 'debit', amount: 1299, merchant: 'AMAZON', cardLast4: '4092', availableLimit: 48701 }
  },
  {
    label: 'SBI Card ending, reward note stays a spend',
    text: 'Rs.500.00 spent on your SBI Credit Card ending 1234 at SWIGGY on 22/10/26. Reward points will be credited.',
    expect: { type: 'transaction', transactionType: 'debit', amount: 500, merchant: 'SWIGGY', cardLast4: '1234' }
  },
  {
    label: 'Axis Card no. format',
    text: 'Spent Card no. XX1234 INR 500 22-10-26 12:00:00 AMAZON Avl Lmt INR 50000',
    expect: { type: 'transaction', transactionType: 'debit', amount: 500, merchant: 'AMAZON', cardLast4: '1234' }
  },
  {
    label: 'SBI UPI Debit',
    text: 'Your a/c XXXXX6789 debited by Rs.850.00 on 22-10-26 transfer to SWIGGY Ref No 123456789012.',
    expect: { type: 'transaction', amount: 850, merchant: 'SWIGGY', category: 'Food Delivery', paymentMode: 'UPI' }
  },
  {
    label: 'ICICI Statement',
    text: 'ICICI Bank Credit Card XX5678 Statement: Total Amt Due Rs.12,450.00 Min Amt Due Rs.1,245.00. Due Date: 08 Nov 2026.',
    expect: { type: 'statement', totalDue: 12450 }
  },
  {
    label: 'Cashback Credited',
    text: 'Cashback of Rs.125.00 has been credited to your Axis Bank Account XX4321 on 21-10-26. Ref: AXCB123456',
    expect: { type: 'cashback_credited', amount: 125, cardLast4: '4321' }
  },
  {
    label: 'Home Loan EMI',
    text: 'Dear Customer, EMI of Rs.24,800 for your Home Loan A/c XXXXXXXX7841 has been debited on 22-Oct-2026. Outstanding: Rs.6,80,000. HDFC Bank',
    // loans are no longer matched from SMS (EMIs post themselves from the loan's schedule), so this is just a bank debit
    expect: { type: 'transaction', transactionType: 'debit', amount: 24800, category: 'EMI', bank: 'HDFC Bank' }
  },
  {
    label: 'MF SIP',
    text: 'SIP of Rs.15,000 processed for Parag Parikh Flexi Cap Fund. Units allotted: 202.5 @ NAV Rs.74.07 on 22-Oct-2026. Folio: 1234567',
    expect: { type: 'investment_sip', amount: 15000, nav: 74.07, units: 202.5 }
  },
  {
    label: 'FD Created',
    text: 'Your Fixed Deposit of Rs.1,00,000 has been created for 12 months @ 7.25% p.a. FD No. XXXXXXXXXX. Maturity Date: 22-Oct-2027. HDFC Bank',
    expect: { type: 'investment_fd', amount: 100000, bank: 'HDFC Bank' }
  },
  {
    label: 'Payment Received',
    text: 'Payment of Rs.39,380 received against your HDFC Credit Card XX4092. Thank you.',
    expect: { type: 'payment_received', amount: 39380, cardLast4: '4092' }
  },
]

let passed = 0, failed = 0

for (const test of TEST_SMS) {
  try {
    const result = parseSMS(test.text, 'HDFCBK', new Date())
    let ok = true
    const errors = []
    for (const [key, expected] of Object.entries(test.expect)) {
      if (result?.[key] !== expected) {
        ok = false
        errors.push(`${key}: expected ${expected}, got ${result?.[key]}`)
      }
    }
    if (ok) {
      console.log(`✅ PASS: ${test.label}`)
      passed++
    } else {
      console.log(`❌ FAIL: ${test.label}`)
      errors.forEach(e => console.log(`   → ${e}`))
      failed++
    }
  } catch (e) {
    console.log(`💥 ERROR: ${test.label}: ${e.message}`)
    failed++
  }
}

console.log(`\n${passed}/${passed + failed} tests passed`)
export {}
