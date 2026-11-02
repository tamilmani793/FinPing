// Reads the "Consumption Charges and Collection Details" table of an electricity board site (TNEB style) that was copied and pasted.
// Each row has 22 columns, separated by tabs:
//   1 Date  2 Entry date  3 Status  4 KWH  5 KVAH  6 Recorded demand  7 Power factor  8 Consumption in units  9 CC charges  10-14 other charges
//   15 Total charges  16 Advance paid  17 Adjustment  18 Amount to be paid  19 Due date  20 Amount paid  21 Receipt no  22 Collection date
// Used here:  Date -> billed date, KWH -> meter reading, Consumption -> units, Amount to be paid -> amount, Due date -> due date,
// Collection date -> paid date.  A "PMC" row (previous assessment amount billed) has text in place of the readings and so fewer columns.
const dmy = s => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s || '').trim())
  if (!m) return null
  const d = new Date(+m[3], +m[2] - 1, +m[1])
  return d.getFullYear() === +m[3] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[1] ? d : null
}
const num = s => {
  const t = String(s ?? '').replace(/,/g, '').trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export function parseEbTable(text) {
  const rows = []
  let skipped = 0
  for (const raw of String(text || '').replace(/\r/g, '').split('\n')) {
    const c = raw.split('\t').map(x => x.trim())
    const date = dmy(c[0])
    if (!date || !dmy(c[1])) continue // headers, the 1..22 numbering row and blank lines
    const normal = /^NORMAL$/i.test(c[2])
    // after the status: a normal row has 5 reading columns and 6 charge columns before the totals, a PMC row has one text cell
    const o = normal ? 14 : 4
    const total = num(c[o]), advance = num(c[o + 1]), toPay = num(c[o + 3]), due = dmy(c[o + 4]), amountPaid = num(c[o + 5]), receipt = c[o + 6] || '', paidOn = dmy(c[o + 7])
    // nothing left to pay (the bill was settled from an advance): the bill's cost is the total charges
    const amount = toPay > 0 ? toPay : total || 0
    if (!(amount >= 0) || (!due && !total && !toPay)) { skipped++; continue }
    rows.push({
      date, reading: normal ? num(c[3]) : null, units: normal ? num(c[7]) : null, amount, dueDate: due, receipt,
      paid: (amountPaid || 0) > 0 || !!paidOn || !(toPay > 0), paidOn, status: normal ? 'NORMAL' : c[2],
      note: !normal ? 'Previous assessment amount billed' : (advance > 0 ? `Advance adjusted ${advance}` : ''),
    })
  }
  return { rows, skipped }
}
