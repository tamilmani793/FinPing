// Dummy data for the screenshots and the demo PDF. Nothing here is real: the person, cards, accounts and amounts are made up.
// It runs inside the app's page (see capture.mjs) and fills the browser's local database.
window.__seedDemo = async () => {
  const { db } = await import('/src/db/schema.js')
  const { setUserName } = await import('/src/lib/profile.js')
  for (const t of db.tables) await t.clear()
  setUserName('Aarav Mehta')
  try { localStorage.setItem('finping_options', '{}') } catch (e) {}

  const now = new Date()
  const Y = now.getFullYear(), M = now.getMonth(), D = now.getDate()
  const at = (monthsAgo, day, hour = 13) => new Date(Y, M - monthsAgo, day, hour, 5)
  const ahead = days => new Date(Y, M, D + days)
  // a repeatable "random": the same numbers every run
  let seed = 7
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
  const pick = a => a[Math.floor(rnd() * a.length)]
  const amt = (lo, hi) => Math.round(lo + rnd() * (hi - lo))

  // ── accounts and cards ──
  const card = {
    cardType: 'credit', bank: 'HDFC Bank', cycleSet: true, isLTF: true, totalAnnualFee: 0, pointValue: 1, feeWaiverThreshold: 0,
    currentBalance: 0, unbilled: 0, statementBalance: 0, pendingDue: 0, minimumDue: 0, availableCredit: 0, creditLimit: 0, rewardMode: 'cashback',
  }
  const millennia = await db.creditCards.add({ ...card, name: 'HDFC Millennia', cardLast4: '4821', network: 'Visa', creditLimit: 300000, availableCredit: 262000, billingCycleDate: 15, paymentDueDays: 20, statementBalance: 14820, pendingDue: 14820, minimumDue: 1482, rewardPoints: 1860, issueDate: at(20, 10), isLTF: true })
  const sbi = await db.creditCards.add({ ...card, name: 'SBI Cashback', bank: 'State Bank of India', cardLast4: '7765', network: 'Visa', creditLimit: 200000, availableCredit: 171500, billingCycleDate: 1, paymentDueDays: 20, statementBalance: 8281, pendingDue: 8281, minimumDue: 1379, isLTF: false, annualFee: 999, annualFeeGST: 179.82, totalAnnualFee: 1178.82, feeWaiverThreshold: 200000, issueDate: at(14, 4) })
  const hsbc = await db.creditCards.add({ ...card, name: 'HSBC Live+', bank: 'HSBC', cardLast4: '3902', network: 'Visa', creditLimit: 150000, availableCredit: 141200, billingCycleDate: 2, paymentDueDays: 18, statementBalance: 4310, pendingDue: 0, statusPaid: true, isLTF: false, annualFee: 999, annualFeeGST: 179.82, totalAnnualFee: 1178.82, feeWaiverThreshold: 200000, issueDate: at(9, 20) })
  const rupay = await db.creditCards.add({ ...card, name: 'HDFC RuPay Credit Card', cardLast4: '1188', network: 'RuPay', creditLimit: 100000, availableCredit: 94600, billingCycleDate: 8, paymentDueDays: 20, statementBalance: 2150, pendingDue: 2150, minimumDue: 215, issueDate: at(16, 12) })
  const acct = { cardType: 'account', bank: 'HDFC Bank', network: '', currentBalance: 0, creditLimit: 0, availableCredit: 0 }
  const savings = await db.creditCards.add({ ...acct, name: 'HDFC Bank account ••5521', cardLast4: '5521', accountBalance: 124560.5, variant: 'Savings' })
  const salaryAcc = await db.creditCards.add({ ...acct, name: 'Indian Bank account ••8870', bank: 'Indian Bank', cardLast4: '8870', accountBalance: 18240.25, variant: 'Savings' })
  const debit = await db.creditCards.add({ cardType: 'debit', bank: 'HDFC Bank', name: 'HDFC Millennia Debit', cardLast4: '2076', network: 'Visa', linkedAccountId: savings, currentBalance: 0 })
  const { autoApplyPresets } = await import('/src/lib/rulesPack.js')
  await autoApplyPresets()

  // ── transactions: three months of spends, payments and salary ──
  const tx = []
  const add = (date, amount, type, merchant, category, cardId, mode, extra = {}) => tx.push({
    date, amount, type, merchant, category, cardId, paymentMode: mode, bank: '', accountLast4: null, tags: [], notes: '', isExcluded: false, parsedBy: 'auto', createdAt: date, ...extra,
  })
  const SPENDS = [
    ['Swiggy', 'Food & Dining', [250, 720], millennia], ['Zomato', 'Food & Dining', [220, 640], sbi], ['BigBasket', 'Grocery', [900, 2600], hsbc], ['Reliance Fresh', 'Grocery', [400, 1800], hsbc],
    ['Amazon', 'Shopping', [350, 4200], sbi], ['Flipkart', 'Shopping', [500, 3800], millennia], ['Myntra', 'Shopping', [800, 3200], sbi], ['Uber', 'Transport', [120, 480], millennia],
    ['Netflix', 'Entertainment', [649, 649], sbi], ['BookMyShow', 'Entertainment', [400, 1200], millennia], ['Apollo Pharmacy', 'Health', [180, 1400], hsbc], ['Indian Oil', 'Fuel', [1500, 3200], millennia],
    ['MakeMyTrip', 'Travel', [2800, 9500], sbi], ['Cult.fit', 'Health', [999, 1500], millennia], ['Tata CLiQ', 'Shopping', [900, 4500], sbi], ['Starbucks', 'Food & Dining', [300, 760], hsbc],
  ]
  for (let mo = 3; mo >= 0; mo--) {
    const count = mo === 0 ? 11 : 16
    for (let i = 0; i < count; i++) {
      const [m, c, [lo, hi], cardId] = pick(SPENDS)
      const day = mo === 0 ? Math.min(D, 1 + Math.floor(rnd() * Math.max(1, D))) : 1 + Math.floor(rnd() * 27)
      add(at(mo, day, 9 + Math.floor(rnd() * 12)), amt(lo, hi), 'debit', m, c, cardId, 'Credit Card')
    }
    // UPI spends on the RuPay card and the bank account
    for (let i = 0; i < 5; i++) add(at(mo, 2 + i * 5), amt(60, 520), 'debit', pick(['Local Kirana', 'Chai Point', 'Auto fare', 'Vegetable market']), pick(['Grocery', 'Food & Dining', 'Transport']), rupay, 'UPI')
    // salary, rent, a SIP and the card bills paid from the savings account
    add(at(mo, 1, 10), 164250, 'credit', 'Northwind Technologies salary', 'Salary', salaryAcc, 'Bank', { accountLast4: '8870' })
    add(at(mo, 3, 10), 30000, 'debit', 'Rent to landlord', 'Rent', savings, 'Bank', { accountLast4: '5521' })
    add(at(mo, 5, 9), 15000, 'debit', 'Nifty 50 index fund SIP', 'Investment', savings, 'Bank', { accountLast4: '5521' })
    add(at(mo, 18, 11), 12400, 'debit', 'HDFC Millennia bill payment', 'Card Payment', savings, 'Bank', { accountLast4: '5521', kind: 'card_payment' })
    add(at(mo, 18, 11), 12400, 'credit', 'Payment received', 'Card Payment', millennia, 'Credit Card', { kind: 'card_payment' })
    add(at(mo, 21, 11), 9200, 'debit', 'SBI Card bill payment', 'Card Payment', savings, 'Bank', { accountLast4: '5521', kind: 'card_payment' })
    add(at(mo, 21, 11), 9200, 'credit', 'Payment received', 'Card Payment', sbi, 'Credit Card', { kind: 'card_payment' })
    if (mo > 0) add(at(mo, 3, 15), 1200, 'credit', 'Card cashback credit', 'Cashback', sbi, 'Credit Card')
  }
  // bills paid from the account, and a few charges for the Advisory to find
  for (let mo = 0; mo <= 3; mo++) {
    add(at(mo, 2, 18), amt(1200, 1700), 'debit', 'TNEB electricity bill', 'Utilities & Bills', savings, 'Bank', { accountLast4: '5521' })
    add(at(mo, 4, 9), 1180, 'debit', 'ACT Fibernet broadband', 'Utilities & Bills', savings, 'Bank', { accountLast4: '5521' })
  }
  add(at(1, 19), 600, 'debit', 'Late payment fee', 'Fees & Charges', hsbc, 'Credit Card', { bankNarration: 'LATE PAYMENT FEE' })
  add(at(1, 19), 108, 'debit', 'GST on late payment fee', 'Fees & Charges', hsbc, 'Credit Card', { bankNarration: 'IGST ON LATE PAYMENT FEE' })
  add(at(2, 16), 1412, 'debit', 'Finance charges', 'Fees & Charges', rupay, 'Credit Card', { bankNarration: 'FINANCE CHARGES' })
  add(at(1, 6), 2000, 'debit', 'Paytm wallet load', 'Wallet Load', sbi, 'Credit Card')
  add(at(1, 12), 3000, 'debit', 'Amazon Pay wallet load', 'Wallet Load', sbi, 'Credit Card')
  add(at(0, Math.max(1, D - 2)), 1500, 'debit', 'Phone recharge', 'Utilities & Bills', sbi, 'Credit Card')
  await db.transactions.bulkAdd(tx)
  const { tagAllCards } = await import('/src/lib/rewardTagging.js')
  await tagAllCards()

  // ── bills ──
  const eb = await db.bills.add({ kind: 'electricity', name: 'Home electricity', provider: 'TNEB (TNPDCL)', accountNo: '12-345-678-901', cycle: 'm2', status: 'active', nextDue: null, amount: null, notes: '', createdAt: now })
  let reading = 6120
  const readings = []
  for (let i = 7; i >= 0; i--) {
    const units = amt(380, 540) - (i % 3 === 0 ? 90 : 0)
    reading += units
    const date = at(i * 2 + 0, 8, 10), dueDate = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 20)
    const paid = i > 0
    readings.push({ billId: eb, date, amount: Math.round(units * (units > 500 ? 3.3 : 3.05)), units, reading, dueDate, paid, paidOn: paid ? new Date(date.getFullYear(), date.getMonth(), date.getDate() + 6) : null })
  }
  readings[readings.length - 1].date = new Date(Y, M, D - 3); readings[readings.length - 1].dueDate = ahead(6)
  await db.bill_entries.bulkAdd(readings)
  const lpg = await db.bills.add({ kind: 'gas', name: 'LPG cylinder', provider: 'Indane (Indian Oil)', accountNo: '1000-2345-6789', cycle: 'once', status: 'active', createdAt: now })
  await db.bill_entries.bulkAdd([
    { billId: lpg, date: ahead(-190), bookedOn: ahead(-192), startedOn: ahead(-186), amount: 903, paid: true },
    { billId: lpg, date: ahead(-118), bookedOn: ahead(-121), startedOn: ahead(-116), amount: 903, paid: true },
    { billId: lpg, date: ahead(-52), bookedOn: ahead(-55), startedOn: ahead(-49), amount: 918, paid: true },
  ])
  await db.bills.add({ kind: 'mobile', name: 'Airtel prepaid', provider: 'Airtel', accountNo: '98765 43210', cycle: 'd84', nextDue: ahead(9), amount: 859, status: 'active', createdAt: now })
  await db.bills.add({ kind: 'broadband', name: 'Home broadband', provider: 'ACT Fibernet', accountNo: '55012345', cycle: 'm1', nextDue: ahead(3), amount: 1180, status: 'active', createdAt: now })

  // ── insurance, loans, yearly costs ──
  await db.policies.bulkAdd([
    { name: 'LIC Tech Term', insurer: 'LIC', type: 'Term insurance', policyNo: 'T-218845', sumAssured: 15000000, premium: 21400, frequency: 'yearly', nextDueDate: ahead(74), status: 'active' },
    { name: 'Star Family Health Optima', insurer: 'Star Health', type: 'Health insurance', policyNo: 'H-77120', sumAssured: 1000000, premium: 24600, frequency: 'yearly', nextDueDate: ahead(120), status: 'active' },
    { name: 'ICICI Lombard Car Insurance', insurer: 'ICICI Lombard', type: 'Vehicle insurance', policyNo: 'V-90412', sumAssured: 0, premium: 9800, frequency: 'yearly', nextDueDate: ahead(28), status: 'active', coverType: 'Comprehensive' },
  ])
  const firstEmi = n => new Date(Y, M + 1, n)
  await db.debts.bulkAdd([
    { name: 'Home loan', type: 'HomeLoan', lender: 'HDFC Ltd', status: 'active', principal: 4200000, currentOutstanding: 3585000, interestRate: 8.6, emiAmount: 38500, tenureMonths: 240, paidCount: 31, nextEmiDate: firstEmi(5), emiDate: 5, mode: 'reducing', startDate: at(31, 5), interestFrom: new Date(Y, M, 5) },
    { name: 'Car loan', type: 'CarLoan', lender: 'SBI', status: 'active', principal: 750000, currentOutstanding: 412000, interestRate: 9.1, emiAmount: 15600, tenureMonths: 60, paidCount: 28, nextEmiDate: firstEmi(10), emiDate: 10, mode: 'reducing', startDate: at(28, 10), interestFrom: new Date(Y, M, 10) },
    { name: 'Business cash credit', type: 'Overdraft', lender: 'Indian Bank', status: 'active', principal: 300000, currentOutstanding: 185000, interestRate: 11.5, emiAmount: 0, mode: 'reducing', startDate: at(10, 15) },
  ])
  await db.sinking_items.bulkAdd([
    { name: 'Car service and tyres', amount: 14000, cycle: 'm12', nextDue: new Date(Y, M + 5, 1), note: 'Yearly' },
    { name: 'Property tax', amount: 9000, cycle: 'm6', nextDue: new Date(Y, M + 2, 15), note: 'Half-yearly' },
  ])

  // ── wealth: PPF with deposits, funds, gold ──
  await db.investments.bulkAdd([
    { name: 'PPF - SBI', type: 'PPF', last4: '4417', investedAmount: 582000, currentValue: 700000, startDate: at(60, 1), source: 'manual', entries: [
      { date: at(60, 1), amount: 300000, opening: true }, { date: new Date(Y - 1, 3, 3), amount: 150000 }, { date: new Date(Y, 3, 4), amount: 120000 }, { date: new Date(Y, 8, 2), amount: 12000 }], ppfInterest: {} },
    { name: 'Nifty 50 index fund', type: 'MutualFund', investedAmount: 420000, currentValue: 505200, startDate: at(30, 5), source: 'manual', notes: '' },
    { name: 'Flexi cap fund', type: 'MutualFund', investedAmount: 180000, currentValue: 214800, startDate: at(18, 5), source: 'manual', notes: '' },
    { name: 'Direct equity', type: 'Stock', investedAmount: 150000, currentValue: 187500, startDate: at(26, 12), source: 'manual', notes: '' },
    { name: 'Sovereign gold bond', type: 'Gold', investedAmount: 120000, currentValue: 172000, startDate: at(40, 20), source: 'manual', notes: '' },
    { name: 'NPS Tier 1', type: 'NPS', last4: '9031', investedAmount: 210000, currentValue: 246000, startDate: at(36, 1), source: 'manual', notes: '' },
  ])

  // ── salary and payslips ──
  const job = await db.salaryJobs.add({ employer: 'Northwind Technologies', employeeName: 'Aarav Mehta', employeeId: 'NW10442', designation: 'Senior Engineer', level: 'L5', department: 'Platform', location: 'Chennai', entity: 'Northwind Technologies Pvt Ltd', bank: 'Indian Bank', accountLast4: '8870', uan: '', pfNo: '', joinDate: '2022-07-01', endDate: null, ctc: 2150000, salaryDay: 1, notes: '', createdAt: now })
  await db.salaryRevisions.bulkAdd([{ jobId: job, date: '2022-07-01', ctc: 1700000, kind: 'joining', note: '' }, { jobId: job, date: '2024-04-01', ctc: 1900000, kind: 'hike', note: '' }, { jobId: job, date: '2025-04-01', ctc: 2150000, kind: 'promotion', note: 'Promoted to Senior Engineer' }])
  const recs = []
  for (let k = 14; k >= 1; k--) {
    const d = new Date(Y, M - k, 1)
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const gross = d < new Date(Y - 1, 3, 1) ? 158000 : 179000
    const pf = d < new Date(Y - 1, 3, 1) ? 7200 : 7800
    const tds = Math.round(gross * 0.11), profTax = 208
    recs.push({ jobId: job, month, basic: pf / 0.12, gross, bonus: 0, pf, profTax, tds, otherDed: 0, net: gross - pf - profTax - tds, creditedOn: new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString().slice(0, 10), notes: '', createdAt: now })
  }
  await db.salaryRecords.bulkAdd(recs)
  await db.pf_rates.bulkAdd([{ fy: '2023-24', rate: 8.25 }, { fy: '2024-25', rate: 8.25 }, { fy: '2025-26', rate: 8.25 }])

  // ── a few advisory lessons kept ──
  await db.advisory_notes.add({ key: 'demo-fuel', savedAt: now, title: 'Fuel surcharge', text: 'Keep each fuel fill between ₹400 and ₹4,000 on a credit card to avoid the 1% surcharge.' })
  return { cards: 7, txns: tx.length }
}
