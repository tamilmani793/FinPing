// The single source for the README's feature list, the interactive page (docs/index.html) and the demo PDF (docs/FinPing-Demo.pdf).
// Edit this file, then run:  node docs/tools/build-docs.mjs
export const app = {
  name: 'FinPing',
  tagline: 'Personal finance for India that never leaves your phone',
  summary: 'SMS and statement driven tracking of spends, cards and rewards, bills, loans, insurance, salary, provident fund and wealth. Everything is stored on the device. There is no account, no server and nothing is uploaded.',
  stack: ['React 18', 'Vite 5', 'Dexie (IndexedDB)', 'Zustand', 'Recharts', 'pdf.js', 'Capacitor 6 (Android)', 'PWA'],
}

// groups of features; `screen` points at a screenshot in `screens` below
export const features = [
  {
    id: 'capture', title: 'Capture', icon: '📥',
    summary: 'Get transactions in without typing them.',
    items: [
      { title: 'Bank SMS tracking', text: 'On Android the app reads bank SMS on the phone and turns them into transactions: card spends, UPI, ATM withdrawals, credits, refunds, cashback and bill payments. OTPs, failed payments and balance-only messages are ignored. Two SMS about one payment are merged into one entry.', screen: '02-history' },
      { title: 'Statement import', text: 'Bank and credit-card statements as PDF (including password-protected ones), Excel or CSV. Columns are found by themselves, Dr/Cr and C/D markers are understood, the running balance is checked line by line, and the bank\'s own totals are compared so you know nothing was missed. Entries you already have are matched, not doubled.', screen: '03-accounts' },
      { title: 'Manual entries', text: 'Add an expense or income against a card or bank account. Card balances and account balances move just as an SMS would move them.', screen: '02-history' },
      { title: 'Link and tidy', text: 'Link unlinked transactions to their card or account with checkboxes, or pick the account yourself when the SMS has no digits. Clean up duplicates and non-payments. Transfers between your own accounts are paired so they do not count as income or spending.', screen: '19-profile' },
      { title: 'Categories', text: 'A short, simple category list. Rename a category and every transaction follows. Change the category of many transactions at once. Dropdown lists (banks, networks, insurers, providers) are yours to edit.', screen: '19-profile' },
    ],
  },
  {
    id: 'cards', title: 'Cards, accounts and rewards', icon: '💳',
    summary: 'Every card and account, with the rewards each should have earned.',
    items: [
      { title: 'Credit cards', text: 'Limit, available credit, billing cycle, due date, billed and unbilled spends, statement paid or pending, minimum due, shared limits across cards, payments you record, annual fee and fee-waiver spend. 50 popular Indian cards come bundled; a card can be added from its statement or welcome letter.', screen: '03-accounts' },
      { title: 'Debit cards and bank accounts', text: 'Balances follow the "Avl bal" in SMS, or move with each spend or credit when the SMS has none. A debit card can be linked to its account, and "Recalculate from transactions" rebuilds a balance from the bank\'s last reported figure.', screen: '03-accounts' },
      { title: 'Reward rules per card', text: 'Cashback or points, accelerated rates by category, merchant, MCC or online/in-shop, minimum spend, caps per cycle or month, exclusions (fuel, rent, government, EMI, wallet loads) and versions that start on a date, so a bank\'s later change never rewrites the past. Rules can be updated from the bundled library.', screen: '16-card-advisor' },
      { title: 'Rewards audit', text: 'What each card should have earned in a cycle against what the bank credited, with the transactions behind any gap. A cashback summary shows credited cashback by month.', screen: '06-card-statements' },
      { title: 'Card statements as bills', text: 'Tap a card in Bills to see the open cycle and past statements: spends, payments, reward earned, cashback credited, limit used and the change from the statement before.', screen: '06-card-statements' },
    ],
  },
  {
    id: 'bills', title: 'Bills', icon: '🧾',
    summary: 'Every bill in one list: cards, electricity, mobile, broadband, gas and more.',
    items: [
      { title: 'One list, grouped by urgency', text: 'Overdue, due this week, coming up and paid, with totals for overdue and the next 30 days. Filter by Cards, Insurance, Utilities, Telecom and Other. Mark a bill paid in one tap and its next due date follows.', screen: '04-bills' },
      { title: 'Electricity tracker', text: 'Each bill carries its own date of reading, meter reading, due date, units and amount. Units are worked out from the meter reading and the last one, or typed. See units a month, rupees a unit, the change from the bill before, and the paid date. Import the electricity board\'s consumption table in one paste.', screen: '05-electricity' },
      { title: 'Gas cylinder tracker', text: 'Log when a cylinder was booked and when you started using it. The app learns how many days one lasts and tells you when to book the next.', screen: '04-bills' },
      { title: 'Mobile, broadband and more', text: 'Prepaid recharges by validity (28, 56 or 84 days), broadband, water, DTH and OTT, rent. Provider dropdowns hold electricity boards, gas companies, mobile and broadband operators, and anything you add.', screen: '04-bills' },
    ],
  },
  {
    id: 'wealth', title: 'Wealth', icon: '📈',
    summary: 'What you own, grouped the way you think about it.',
    items: [
      { title: 'Allocation by group', text: 'Retirement (PPF, provident fund, NPS), Market (equity, mutual funds) and Safe (gold, deposits, other), each with a subtotal and percentage. Tap an asset to see its accounts and details.', screen: '07-wealth' },
      { title: 'PPF done properly', text: 'Log deposits, see the ₹1.5 lakh yearly limit, and get interest by the real rule (lowest balance between the 5th and month end, credited on 31 March). The current value is deposits plus interest credited, year by year, with the rate per year and the passbook figure when you have it.', screen: '08-ppf' },
      { title: 'Funds, stocks, gold, NPS', text: 'Invested against current value, gain and percentage, entries you can edit, and the last four digits of the account number.', screen: '07-wealth' },
    ],
  },
  {
    id: 'income', title: 'Salary and provident fund', icon: '💼',
    summary: 'Payslips, tax and PF worked out from your own documents.',
    items: [
      { title: 'Salary', text: 'Employers, CTC revisions, and one payslip per month. A payslip parser reads single payslips, registers and common layouts on the phone and stores no payslip files. Yearly gross, tax, PF and take-home totals, and a check against the credit in your bank.', screen: '10-salary' },
      { title: 'Provident fund', text: 'Employee and employer shares, the pension (EPS) share capped at ₹1,250 where it applies, and the rest to PF. Each employer has its own split. Interest per financial year, passbook figures from a PDF or a pasted EPFO table, and the balance after each year.', screen: '11-provident-fund' },
    ],
  },
  {
    id: 'debt', title: 'Debt, insurance and yearly costs', icon: '🏦',
    summary: 'Loans, premiums and the costs that arrive once a year.',
    items: [
      { title: 'Loans and EMIs', text: 'Reducing-balance loans, fixed-EMI purchases and a bank\'s own pasted schedule. A ledger of payments, the schedule still to come, part payments that shorten the loan, and EMIs posted on their due date.', screen: '12-debt-loans' },
      { title: 'Prepay what-if', text: 'Pay extra once or every month and see the interest saved and the time cut, then compare it with investing the same money. Flexible loans such as cash credit and overdraft work from the monthly payment you choose.', screen: '13-prepay-what-if' },
      { title: 'Insurance', text: 'Policies with insurer, type, cover, premium, frequency and next due date. Premiums count as a monthly outgo and appear in Bills when due.', screen: '14-insurance' },
      { title: 'Yearly costs', text: 'Yearly, half-yearly and quarterly premiums, card annual fees and costs you add (car service, property tax) become one monthly amount to set aside, with how much you would have put by.', screen: '15-yearly-costs' },
    ],
  },
  {
    id: 'insights', title: 'Insights', icon: '💡',
    summary: 'Use the data you already have.',
    items: [
      { title: 'Card advisor', text: 'The best card for each kind of spend and for brands like Swiggy or Amazon, with the conditions (minimum spend, caps, online only). UPI goes only to RuPay cards. Last month\'s missed rewards with the transactions, and fee-waiver progress with the spend needed each month.', screen: '16-card-advisor' },
      { title: 'Advisory', text: 'Finds what you paid without choosing it: interest, late fees, over-limit, cash-advance fees, annual fees, SMS charges, forex mark-up, wallet-load fees and fuel surcharge. Each comes with how to avoid it, and lessons can be kept.', screen: '17-advisory' },
      { title: 'Charts', text: 'Where the money went, by category and month, with filters by period and account.', screen: '18-charts' },
    ],
  },
  {
    id: 'data', title: 'Your data and the app', icon: '🔒',
    summary: 'Private by design, easy to move.',
    items: [
      { title: 'Local only', text: 'Everything lives in the browser\'s IndexedDB on your phone. No account, no server, no analytics. SMS text and statements never leave the device.', screen: '19-profile' },
      { title: 'Backup and restore', text: 'Export one JSON file with every table and setting, and restore it on another phone. Export reminders show how old your last backup is.', screen: '19-profile' },
      { title: 'Android and PWA', text: 'Runs as an installable offline web app and as an Android app (Capacitor) that can read SMS. Light and dark themes.', screen: '01-home' },
      { title: 'Consistent navigation', text: 'Five tabs along the bottom (Home, History, Accounts, Bills, Wealth), a Money hub for everything else, and the same back arrow on every page you open from it. Dates are typed as dd-mm-yyyy and shown as 20 Nov 2026.', screen: '09-money-hub' },
    ],
  },
]

export const screens = [
  { file: '01-home', title: 'Home', caption: 'The month at a glance: spends, income, cash flow, card dues and monthly EMI.' },
  { file: '02-history', title: 'History', caption: 'Every transaction, with filters, bulk category change and reward tags.' },
  { file: '03-accounts', title: 'Accounts', caption: 'Credit cards with limits, dues and status, plus debit cards and bank accounts.' },
  { file: '04-bills', title: 'Bills', caption: 'All bills in one list, grouped by how soon they are due.' },
  { file: '05-electricity', title: 'Electricity bill', caption: 'Consumption by bill: units, rate, change, due date and paid date.' },
  { file: '06-card-statements', title: 'Card statements', caption: 'Past statements with spends, rewards earned and cashback credited.' },
  { file: '07-wealth', title: 'Wealth', caption: 'Allocation grouped into Retirement, Market and Safe.' },
  { file: '08-ppf', title: 'PPF', caption: 'Deposits, yearly limit and interest year by year.' },
  { file: '09-money-hub', title: 'Money hub', caption: 'Earn, Pay, Grow and Insights in one place.' },
  { file: '10-salary', title: 'Salary', caption: 'Employers, payslips and yearly totals.' },
  { file: '11-provident-fund', title: 'Provident fund', caption: 'Employee, employer and pension shares with yearly interest.' },
  { file: '12-debt-loans', title: 'Debt and loans', caption: 'EMIs, ledger and the schedule still to come.' },
  { file: '13-prepay-what-if', title: 'Prepay what-if', caption: 'Interest saved and time cut by paying extra, against investing it.' },
  { file: '14-insurance', title: 'Insurance', caption: 'Policies, premiums and due dates.' },
  { file: '15-yearly-costs', title: 'Yearly costs', caption: 'A monthly amount to set aside for yearly bills.' },
  { file: '16-card-advisor', title: 'Card advisor', caption: 'Which card to use for each spend, with the conditions.' },
  { file: '17-advisory', title: 'Advisory', caption: 'Hidden charges found in your transactions, and how to avoid them.' },
  { file: '18-charts', title: 'Charts', caption: 'Where the money went, by category and month.' },
  { file: '19-profile', title: 'Profile', caption: 'Backup, customise, tidy-up tools and settings.' },
]

export const roadmap = [
  { group: 'Planning', items: [
    { title: 'Goals', text: 'Emergency fund (months of expenses covered), down payment and retirement corpus. Each can draw on EPF, PPF and SIPs.' },
    { title: 'Insurance adequacy', text: 'Compare term cover with about 10 times your income from payslips, and check the health cover too.' },
    { title: 'Retirement projection', text: 'EPF, PPF and NPS growth to the age you pick.' },
  ] },
  { group: 'Ask and remind', items: [
    { title: 'Ask in plain words', text: 'A search bar that answers "how much on Swiggy in October?" from your own data.' },
    { title: 'Due-date calendar and reminders', text: 'A next-30-days view and phone notifications before every due date.' },
    { title: 'Data health screen', text: 'Unlinked transactions, stale balances, cards without a cycle and bills without a due date, each with a fix button.' },
  ] },
  { group: 'Money care', items: [
    { title: 'Tax and 80C summary', text: 'Provident fund, PPF, insurance and payslips totalled for the year, with Form 16 checked against payslips.' },
    { title: 'Recurring charges', text: 'Spot subscriptions and SIPs in your transactions and offer them as bills.' },
    { title: 'Net worth over time', text: 'Assets less liabilities, saved every month as a trend.' },
    { title: 'Mutual fund statement import', text: 'One CAS statement fills in your funds, units and value.' },
    { title: 'Nested categories and budgets', text: 'Sub-categories with a monthly budget for each.' },
    { title: 'Safer data', text: 'Weekly backup reminder, share to Drive, and an optional PIN or fingerprint lock.' },
  ] },
]

// what the made-up data in the screenshots and the PDF contains
export const dummy = {
  person: 'Aarav Mehta (made up)',
  note: 'Every name, number and amount in the screenshots and in this PDF is invented for the demo. No real account or person is shown.',
  tables: [
    { title: 'Cards and accounts', head: ['Name', 'Kind', 'Detail'], rows: [
      ['HDFC Millennia ••4821', 'Credit card, Visa', 'Limit ₹3,00,000 · cycle on the 15th · lifetime free'],
      ['SBI Cashback ••7765', 'Credit card, Visa', 'Limit ₹2,00,000 · cycle on the 1st · fee ₹1,179 a year'],
      ['HSBC Live+ ••3902', 'Credit card, Visa', 'Limit ₹1,50,000 · cycle on the 2nd · fee ₹1,179 a year'],
      ['HDFC RuPay ••1188', 'Credit card, RuPay', 'Limit ₹1,00,000 · UPI enabled'],
      ['HDFC Bank account ••5521', 'Savings', 'Balance ₹1,24,560.50'],
      ['Indian Bank account ••8870', 'Savings (salary)', 'Balance ₹18,240.25'],
      ['HDFC Millennia Debit ••2076', 'Debit card', 'Linked to the HDFC account'],
    ] },
    { title: 'Bills', head: ['Bill', 'Provider', 'Detail'], rows: [
      ['Home electricity', 'TNEB (TNPDCL)', '8 bills with meter readings, every 2 months'],
      ['LPG cylinder', 'Indane (Indian Oil)', '3 cylinders logged, about 69 days each'],
      ['Airtel prepaid', 'Airtel', '₹859 every 84 days'],
      ['Home broadband', 'ACT Fibernet', '₹1,180 a month'],
    ] },
    { title: 'Wealth', head: ['Asset', 'Type', 'Invested → current'], rows: [
      ['PPF - SBI ••4417', 'PPF', '₹5,82,000 deposited, interest credited yearly'],
      ['Nifty 50 index fund', 'Mutual fund', '₹4,20,000 → ₹5,05,200'],
      ['Flexi cap fund', 'Mutual fund', '₹1,80,000 → ₹2,14,800'],
      ['Direct equity', 'Stocks', '₹1,50,000 → ₹1,87,500'],
      ['Sovereign gold bond', 'Gold', '₹1,20,000 → ₹1,72,000'],
      ['NPS Tier 1', 'NPS', '₹2,10,000 → ₹2,46,000'],
    ] },
    { title: 'Loans and insurance', head: ['Item', 'Kind', 'Detail'], rows: [
      ['Home loan', 'Reducing balance', '₹35,85,000 owed at 8.6% · EMI ₹38,500'],
      ['Car loan', 'Reducing balance', '₹4,12,000 owed at 9.1% · EMI ₹15,600'],
      ['Business cash credit', 'Flexible', '₹1,85,000 owed at 11.5% · no fixed EMI'],
      ['LIC Tech Term', 'Term insurance', 'Cover ₹1.5 crore · ₹21,400 a year'],
      ['Star Family Health Optima', 'Health insurance', 'Cover ₹10 lakh · ₹24,600 a year'],
      ['ICICI Lombard Car Insurance', 'Vehicle insurance', '₹9,800 a year'],
    ] },
    { title: 'Salary', head: ['Item', 'Detail'], rows: [
      ['Employer', 'Northwind Technologies, Senior Engineer'],
      ['CTC', '₹21.5 lakh after the last revision'],
      ['Payslips', '14 months of payslips · PF ₹7,800 a month'],
      ['Transactions', 'About 120 spends, bills, salary credits and card payments over four months'],
    ] },
  ],
}
