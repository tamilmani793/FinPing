import { addMonths } from 'date-fns'

// Reads a bank's own EMI schedule that has been copied from a statement or e-mail, like this one:
//
//   Loan Number   Loan Booked Date  Loan Type  Principal Amount  Interest Rate  Tenure  Principal Outstanding
//   0000000000138408252  01 Apr 2026  EMI ON DC  61802.28  16.00  12  26952.28
//   Principal (Rs.)  Interest (Rs.)  Statement Date
//   4783.00  934.00  20 Apr 2026
//   4847.00  760.00  20 May 2026
//   ...
//
// A bank's schedule is the truth: its interest does not follow a simple daily calculation, so every
// instalment's principal and interest is kept exactly as printed instead of being recomputed.
const MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 }
const num = s => parseFloat(String(s).replace(/,/g, ''))
// "01 Apr 2026", "10-NOV-26", "10-Nov-2026"
const dateOf = s => {
  const m = String(s).trim().match(/^(\d{1,2})[\s-]+([A-Za-z]{3})[a-z]*[\s-]+(\d{2,4})$/)
  if (!m || MON[m[2].toLowerCase()] == null) return null
  return new Date(m[3].length === 2 ? 2000 + +m[3] : +m[3], MON[m[2].toLowerCase()], +m[1], 12)
}
const r2 = n => Math.round(n * 100) / 100

export function typeFromBank(loanType) {
  const t = String(loanType || '').toUpperCase()
  if (/\bDC\b|DEBIT/.test(t)) return 'DebitCardEMI'
  if (/\bCC\b|CREDIT/.test(t)) return 'CreditCardEMI'
  return 'ConsumerEMI'
}

// The due date for a statement: the given day of the NEXT month (statement 20 Apr -> due 5 May). With no
// day given, the statement date itself is the due date.
export function dueFor(statementDate, dueDay) {
  if (!(Number(dueDay) >= 1)) return new Date(statementDate)
  const n = addMonths(new Date(statementDate.getFullYear(), statementDate.getMonth(), 1), 1)
  return new Date(n.getFullYear(), n.getMonth(), Math.min(Number(dueDay), new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate()), 12)
}

// Layout 2: a lender's loan-details page, e.g.
//   Loan Number 511000004002 · ROI (%) 9.5 % · EMI Amount ₹ 13,387.00 · FUP Date 10-NOV-26 · Unpaid Inst. 94
//   Principal O/S ₹ 881,486.39 · Loan End Date 10-AUG-34 · Last EMI Payable ₹ 5,611.06
//   Due Date | Interest Rate | EMI (Prin.) | EMI (Int.) | Total EMI | Schedule OS
// Such pages usually print only the next dozen instalments. The printed rows are kept exactly; the rest are
// worked out the way the printed ones are (interest = balance x rate / 12 each month) until the loan ends,
// and checked against the lender's own "Unpaid Inst.", "Loan End Date" and "Last EMI Payable".
function parseLoanDetails(src) {
  const rowRe = /(\d{1,2}-[A-Za-z]{3}-\d{2,4})\s+[\d.]+\s*%+\s*₹?\s*([\d,]+\.\d{2})\s+₹?\s*([\d,]+\.\d{2})\s+₹?\s*([\d,]+\.\d{2})\s+₹?\s*([\d,]+\.\d{2})/g
  const printed = []
  for (const m of src.matchAll(rowRe)) {
    const dueDate = dateOf(m[1])
    if (!dueDate) continue
    printed.push({ dueDate, statementDate: null, principal: num(m[2]), interest: num(m[3]), emi: num(m[4]), balanceAfter: num(m[5]) })
  }
  if (!printed.length) return null
  const grab = (re, conv = x => x) => { const m = src.match(re); return m ? conv(m[1]) : null }
  const money = re => grab(re, num)
  const meta = {
    format: 'loan-details',
    loanNo: grab(/Loan Number\s*[:\t ]*\s*(\d{6,})/i) || '',
    rate: grab(/ROI\s*\(%\)\s*([\d.]+)/i, parseFloat) || 0,
    emi: money(/EMI Amount\s*₹?\s*([\d,]+(?:\.\d+)?)/i) || printed[0].emi,
    sanction: money(/Sanction Amount\s*₹?\s*([\d,]+(?:\.\d+)?)/i),
    disbursed: money(/Disb\. Amount\s*₹?\s*([\d,]+(?:\.\d+)?)/i),
    outstanding: money(/Principal O\/S\s*₹?\s*([\d,]+(?:\.\d+)?)/i),
    unpaid: grab(/Unpaid Inst\.?\s*(\d+)/i, Number),
    endDate: grab(/Loan End Date\s*(\d{1,2}-[A-Za-z]{3}-\d{2,4})/i, dateOf),
    lastEmi: money(/Last EMI Payable\s*₹?\s*([\d,]+(?:\.\d+)?)/i),
    nextDue: grab(/FUP Date\s*(\d{1,2}-[A-Za-z]{3}-\d{2,4})/i, dateOf),
    bookedDate: grab(/First Disb\. Date\s*(\d{1,2}-[A-Za-z]{3}-\d{2,4})/i, dateOf) || grab(/Sanction Date\s*(\d{1,2}-[A-Za-z]{3}-\d{2,4})/i, dateOf),
  }
  meta.principal = meta.disbursed || meta.sanction || 0
  // the balance before the first printed instalment: what is owed now
  meta.currentOutstanding = meta.outstanding ?? r2(printed[0].balanceAfter + printed[0].principal)
  meta.bankOutstanding = null

  // ---- extend the printed rows to the end of the loan ----
  const rows = printed.map((r, i) => ({ ...r, no: i + 1, estimated: false }))
  const day = rows[0].dueDate.getDate()
  const target = meta.unpaid || 600
  let bal = rows[rows.length - 1].balanceAfter
  let due = rows[rows.length - 1].dueDate
  while (bal > 0.005 && rows.length < Math.min(target, 600)) {
    const n = addMonths(new Date(due.getFullYear(), due.getMonth(), 1), 1)
    due = new Date(n.getFullYear(), n.getMonth(), Math.min(day, new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate()), 12)
    const interest = r2(bal * meta.rate / 100 / 12)
    const final = rows.length + 1 >= target || meta.emi - interest >= bal
    const principal = final ? r2(bal) : r2(meta.emi - interest)
    let emi = r2(principal + interest)
    let interestOut = interest
    // anchor the very last EMI to the lender's own "Last EMI Payable" when ours is within a rupee of it
    if (final && meta.lastEmi && Math.abs(meta.lastEmi - emi) < 1) { emi = meta.lastEmi; interestOut = r2(emi - principal) }
    bal = r2(bal - principal)
    rows.push({ no: rows.length + 1, dueDate: due, statementDate: null, principal, interest: interestOut, emi, balanceAfter: bal, estimated: true })
    if (final) break
  }
  const last = rows[rows.length - 1]
  const notes = []
  if (meta.unpaid && rows.length !== meta.unpaid) notes.push(`Your lender lists ${meta.unpaid} unpaid EMIs but ${rows.length} were worked out.`)
  if (meta.endDate && (last.dueDate.getFullYear() !== meta.endDate.getFullYear() || last.dueDate.getMonth() !== meta.endDate.getMonth())) notes.push(`Your lender says the loan ends ${meta.endDate.toDateString().slice(4)}, but the schedule ends ${last.dueDate.toDateString().slice(4)}.`)
  return {
    meta, rows, notes, type: 'HomeLoan', printedCount: printed.length, estimatedCount: rows.length - printed.length,
    principalSum: r2(rows.reduce((s, r) => s + r.principal, 0)),
  }
}

export function parseEmiSchedule(text, { dueDay = 5 } = {}) {
  const src = String(text || '').replace(/ /g, ' ')
  const details = parseLoanDetails(src)
  if (details) return details
  // instalment rows: principal, interest, statement date
  const rows = []
  for (const m of src.matchAll(/([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+(\d{1,2}\s+[A-Za-z]{3}[a-z]*\s+\d{4})/g)) {
    const statementDate = dateOf(m[3])
    if (!statementDate) continue
    const principal = num(m[1]), interest = num(m[2])
    rows.push({ principal, interest, emi: Math.round((principal + interest) * 100) / 100, statementDate })
  }
  if (!rows.length) throw new Error('No instalment rows found. Paste the table with Principal, Interest and Statement Date for every month.')
  rows.sort((a, b) => a.statementDate - b.statementDate)
  rows.forEach((r, i) => { r.no = i + 1; r.dueDate = dueFor(r.statementDate, dueDay) })

  // loan details line (optional): number, booked date, type, principal, rate, tenure, principal outstanding
  const h = src.match(/(\d{8,})\s+(\d{1,2}\s+[A-Za-z]{3}[a-z]*\s+\d{4})\s+([A-Za-z][A-Za-z ]*?)\s+([\d,]+\.\d{2})\s+(\d+(?:\.\d+)?)\s+(\d{1,3})\s+([\d,]+\.\d{2})/)
  const meta = h
    ? { loanNo: h[1], bookedDate: dateOf(h[2]), loanType: h[3].trim(), principal: num(h[4]), rate: num(h[5]), tenure: +h[6], bankOutstanding: num(h[7]) }
    : { loanNo: '', bookedDate: null, loanType: '', principal: Math.round(rows.reduce((s, r) => s + r.principal, 0) * 100) / 100, rate: 0, tenure: rows.length, bankOutstanding: null }
  const sum = Math.round(rows.reduce((s, r) => s + r.principal, 0) * 100) / 100
  return { meta, rows, principalSum: sum, type: typeFromBank(meta.loanType) }
}
