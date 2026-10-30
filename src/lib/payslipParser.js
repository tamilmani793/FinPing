import { PasswordNeeded } from './statementPdf'

// Reads a payslip PDF on this device: either ONE month's payslip, or a PAY REGISTER with many months stacked (one row per month).
// Nothing is uploaded; the file never leaves the phone. Returns
//   { kind: 'payslip' | 'register', employer, employee: {...}, months: [{ month: 'YYYY-MM', gross, net, basic, hra, bonus, allowances,
//     pf, profTax, tds, otherDed, workedDays, lopDays, components: { earnings: {name: amount}, deductions: {...} }, problems: [] }],
//     check: { ok, notes: [] } }
// The check proves the read: take-home = gross earnings - gross deductions in every month, and a register's TOTAL row equals the sum
// of its months.

const MONEY = /^-?[\d,]*\d\.\d\d$/
const money = s => parseFloat(String(s).replace(/,/g, ''))
const r2 = n => Math.round(n * 100) / 100
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }
const monthKey = (name, year) => { const m = MON[String(name).slice(0, 3).toLowerCase()]; if (!m) return ''; const y = String(year).length === 2 ? 2000 + Number(year) : Number(year); return `${y}-${String(m).padStart(2, '0')}` }
const normName = s => String(s || '').toUpperCase().replace(/\s+/g, ' ').trim()

// the page's text as lines of cells {s, x}; lines are items that share a baseline, cells run along x
function toLines(items, tol = 2.5) {
  const cells = items.filter(i => i.str.trim()).map(i => ({ s: i.str.trim(), x: i.transform[4], y: i.transform[5] })).sort((a, b) => b.y - a.y || a.x - b.x)
  const lines = []
  for (const c of cells) { const l = lines.find(l => Math.abs(l.y - c.y) <= tol); if (l) l.cells.push(c); else lines.push({ y: c.y, cells: [c] }) }
  for (const l of lines) {
    // a label can run right up to its amount and come out as one piece ("HOUSE RENT ALLOWANCE25,000.00"): split them
    l.cells = l.cells.flatMap(c => { const m = !MONEY.test(c.s) && c.s.match(/^(.*[A-Za-z.)])\s*(-?\d[\d,]*\.\d\d)$/); return m ? [{ ...c, s: m[1].trim() }, { ...c, s: m[2], x: c.x + 0.5 }] : [c] })
    l.cells.sort((a, b) => a.x - b.x)
  }
  return lines
}

async function openPdf(arrayBuffer, password, pdfjs) {
  if (!pdfjs) {
    pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default
  }
  try {
    const task = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer), password: password || undefined, isEvalSupported: false })
    return { doc: await task.promise, task }
  } catch (e) {
    if (e?.name === 'PasswordException') throw new PasswordNeeded(e.code === 2 || !!password)
    throw new Error('Could not open this PDF. It may be damaged, or not a payslip.')
  }
}

// ── one month's payslip ──
// Payslips differ from company to company (Accenture, TCS...), so the fields are found by their LABELS, not by fixed positions:
// each detail is "label, then its value" on a line, and the earnings / deductions table is read between its header and "Net pay".
const LABELS = {
  employeeId: ['EMPLOYEE ID', 'EMP NO.', 'EMP NO', 'EMPLOYEE NO.', 'EMPLOYEE NO', 'EMP ID', 'EMP CODE', 'EMPLOYEE CODE', 'STAFF NO'],
  name: ['NAME', 'EMPLOYEE NAME', 'EMP NAME'],
  doj: ['DOJ', 'DATE OF JOINING', 'JOINING DATE', 'DATE OF JOIN'],
  bank: ['BANK', 'BANK NAME'],
  account: ['BANK A/C NO.', 'ACC NO.', 'ACC NO', 'ACCOUNT NO.', 'ACCOUNT NO', 'A/C NO.', 'A/C NO', 'ACCOUNT NUMBER', 'BANK ACCOUNT NO.'],
  pfNo: ['PF NO.', 'PF NO', 'PF ACCOUNT NO.', 'PF NUMBER'],
  uan: ['UAN'],
  location: ['LOCATION', 'WORK LOCATION', 'BASE BR.', 'BASE BRANCH'],
  department: ['DEPARTMENT', 'DEPT.', 'DEPT'],
  level: ['MANAGEMENT LEVEL', 'GRADE', 'LEVEL', 'BAND'],
  designation: ['DSGN.', 'DSGN', 'DESIGNATION'],
  entity: ['ENTITY'],
}
const DAYS = { workedDays: ['WORKED DAYS', 'DAYS PAID', 'PAID DAYS', 'STD DAYS'], lopDays: ['LOP DAYS', 'LWP DAYS'] }
const MONTHS_RE = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b[\s|,.\-/]*(20\d\d)\b/i

function parseSinglePayslip(lines) {
  const text = lines.map(l => l.cells.map(c => c.s).join(' | '))
  const out = { employer: '', employee: {}, months: [] }
  out.employer = (text.find(t => /\b(pvt|private|ltd|limited|llp|inc|corp|technologies|solutions|services)\b/i.test(t.split(' | ')[0])) || '').split(' | ')[0]

  // the month: "Payslip For SEPTEMBER 2026", or "JAN" and "2021" sitting side by side near the top
  let month = ''
  for (const t of text.slice(0, 14)) { const m = t.match(MONTHS_RE); if (m) { month = monthKey(m[1], m[2]); break } }
  if (!month) { const m = text.join(' ').match(/(?:for the month of|month)\s*[:\-]?\s*([A-Za-z]+)\W+(20\d\d)/i); if (m) month = monthKey(m[1], m[2]) }

  // "label, value" on one line (several pairs can share a line)
  const kv = {}
  for (const l of lines) {
    const c = l.cells
    for (let i = 0; i < c.length - 1; i++) { const k = normName(c[i].s); if (/^[A-Z][A-Z .\/]*$/.test(k) && !MONEY.test(c[i + 1].s) && !(k in kv)) kv[k] = c[i + 1].s }
  }
  const pick = names => { for (const n of names) if (kv[n]) return kv[n]; return '' }
  const e = out.employee
  for (const [field, names] of Object.entries(LABELS)) e[field] = pick(names)
  if (!e.name) { const t = text.find(x => /^(mr|mrs|ms|shri|smt|dr)\.?\s+\S+/i.test(x.split(' | ')[0])); if (t) e.name = t.split(' | ')[0].replace(/^(mr|mrs|ms|shri|smt|dr)\.?\s+/i, '').replace(/[\s.]+$/, '').trim() }
  if (!e.employer && !out.employer) { const br = (pick(['BASE BR.', 'BASE BRANCH']) || '').split(/\s+-\s+/)[0]; if (br && br.length <= 40) out.employer = br }
  const days = {}
  for (const [k, names] of Object.entries(DAYS)) { const v = Number(String(pick(names)).replace(/,/g, '')); days[k] = Number.isFinite(v) && pick(names) !== '' ? v : null }

  // the table: from the header with both "Earnings" and "Deductions" down to "Net pay". Each (label, amount) pair is a line item; the labels
  // fall into two columns, left (earnings) and right (deductions), found from where the labels sit: the widest gap between them
  const items = []
  let inTable = false
  for (const l of lines) {
    const t = l.cells.map(c => c.s).join(' | ')
    if (!inTable) { if (/\bearnings\b/i.test(t) && /\bdeductions\b/i.test(t)) inTable = true; continue }
    // "9,999.99 Total Deductions": an amount stuck to the label of the next column
    const cells = l.cells.flatMap(c => { const m = MONEY.test(c.s) ? null : c.s.match(/^(-?\d[\d,]*\.\d\d)\s+([A-Za-z].*)$/); return m ? [{ ...c, s: m[1] }, { ...c, s: m[2], x: c.x + 60 }] : [c] })
    let stop = false
    for (let i = 0; i < cells.length - 1; i++) {
      if (MONEY.test(cells[i].s) || !MONEY.test(cells[i + 1].s)) continue
      items.push({ name: normName(cells[i].s), amt: money(cells[i + 1].s), x: cells[i].x })
      if (/^NET PAY/.test(normName(cells[i].s))) stop = true
      i++
    }
    if (stop) break
  }
  const xs = [...new Set(items.filter(i => !/^NET PAY/.test(i.name)).map(i => Math.round(i.x / 10) * 10))].sort((p, q) => p - q)
  let split = Infinity, gap = 0
  for (let i = 1; i < xs.length; i++) if (xs[i] - xs[i - 1] > gap) { gap = xs[i] - xs[i - 1]; split = (xs[i] + xs[i - 1]) / 2 }
  if (gap < 60) split = Infinity
  const earn = {}, ded = {}
  for (const it of items) {
    if (/^NET PAY/.test(it.name)) earn['NET PAY'] = it.amt
    else if (/DEDUCTION/.test(it.name) || it.x >= split) ded[it.name] = it.amt
    else earn[it.name] = it.amt
  }
  // the profile details exactly as printed: label and value pairs from the lines above the earnings / deductions table
  const profile = []
  const seenLabel = new Set()
  const isMonthWord = s => /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*$/i.test(s)
  for (const l of lines) {
    const t = l.cells.map(c => c.s).join(' | ')
    if (/\bearnings\b/i.test(t) && /\bdeductions\b/i.test(t)) break
    const c = l.cells
    if (c.some(x => /\bdetails$/i.test(x.s))) continue // section headings such as "Employee Details"
    for (let i = 0; i < c.length - 1; i++) {
      const label = c[i].s.replace(/[:\s]+$/, ''), value = c[i + 1].s
      if (/^leave balance$/i.test(label)) continue
      if (!/^[A-Za-z][A-Za-z0-9 .\/&()'-]{0,30}$/.test(label) || isMonthWord(label) || /^payslip/i.test(label) || /^[–-]+$/.test(value)) continue
      if (seenLabel.has(label.toUpperCase())) { i++; continue }
      seenLabel.add(label.toUpperCase()); profile.push({ label, value }); i++
    }
  }
  out.months.push(buildMonth(month, earn, ded, { ...days, profile }))
  return out
}

// ── many months: a pay register (header row of components, one row per month) ──
function parseRegister(lines) {
  const header = lines.find(l => l.cells.some(c => c.s === 'Particulars') && l.cells.some(c => c.s === 'Earnings'))
  if (!header) return null
  const isMonth = s => /^[A-Za-z]{3}-\d{2}$/.test(s)
  const rows = lines.filter(l => l.cells.length > 12 && isMonth(l.cells[0].s))
  if (!rows.length) return null
  const hx = name => header.cells.find(c => c.s === name)?.x
  const cellAt = (row, x, tol = 4) => { const c = row.cells.filter(c => Math.abs(c.x - x) <= tol).sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[0]; return c ? c.s : '' }
  const xEarn = hx('Earnings'), xDed = hx('Deduction')
  // amount columns = where the first month row has money, left of / right of the "Deduction" label
  const moneyCols = rows[0].cells.filter(c => MONEY.test(c.s) || isMonth(c.s)).map(c => c.x)
  const amountCols = rows[0].cells.filter(c => MONEY.test(c.s)).map(c => c.x)
  // each header piece belongs to the nearest amount column; pieces of one column are joined left to right ("HOUSE RENT" + "ALLOWANCE")
  const names = new Map(amountCols.map(x => [x, []]))
  for (const c of header.cells) {
    if (c.x < xEarn + 2) continue
    const near = amountCols.map(x => [x, Math.abs(x - c.x)]).sort((a, b) => a[1] - b[1])[0]
    if (near && near[1] <= 8) names.get(near[0]).push(c)
  }
  const colName = x => normName(names.get(x).sort((a, b) => a.x - b.x).map(c => c.s).join(' '))
  const cols = amountCols.map(x => ({ x, name: colName(x), side: xDed != null && x > xDed ? 'ded' : 'earn' }))

  const info = rows[0]
  const emp = {
    location: cellAt(info, hx('Location')), level: cellAt(info, hx('Management Level')), department: cellAt(info, hx('Department')), bank: cellAt(info, hx('Bank')),
    account: cellAt(info, hx('Account Number')), entity: cellAt(info, hx('Entity')), pfNo: cellAt(info, hx('PF')), uan: cellAt(info, hx('PF UAN')),
  }
  // the employee block sits off to the side: a label cell and its value share a column position (x) but not a line
  const labelAt = name => lines.flatMap(l => l.cells).find(c => c.s === name)
  const valueUnder = name => { const lab = labelAt(name); if (!lab) return ''; return lines.flatMap(l => l.cells).filter(c => c !== lab && Math.abs(c.x - lab.x) <= 1.5 && !labelAt(c.s) && !isMonth(c.s)).map(c => c.s)[0] || '' }
  const vals = name => { const lab = labelAt(name); return lab ? lines.flatMap(l => l.cells).filter(c => c !== lab && Math.abs(c.x - lab.x) <= 1.5 && c.s !== name) : [] }
  emp.employeeId = vals('Employee ID').find(c => /^\d{4,}$/.test(c.s))?.s || ''
  emp.name = vals('Employee Name').find(c => /[A-Za-z]{3}/.test(c.s) && !/^(Management Level|Employee ID|DOJ)$/.test(c.s))?.s || ''
  emp.doj = vals('DOJ').find(c => /\d{1,2}\s+[A-Za-z]{3}\s+\d{4}/.test(c.s))?.s || ''
  if (!emp.level) emp.level = vals('Management Level').find(c => /^\d+$/.test(c.s))?.s || ''

  const months = rows.map(r => {
    const earn = {}, ded = {}
    for (const c of cols) { const v = cellAt(r, c.x, 5); if (MONEY.test(v)) (c.side === 'ded' ? ded : earn)[c.name] = money(v) }
    if (ded['NET PAY'] != null) { earn['NET PAY'] = ded['NET PAY']; delete ded['NET PAY'] } // the last column sits right of the deductions but is the take-home
    const profile = [
      ['Employee ID', emp.employeeId], ['Employee Name', emp.name], ['DOJ', emp.doj], ['Worked Days', cellAt(r, hx('Worked Days'), 3)], ['LOP Days', cellAt(r, hx('LOP Days'), 3)],
      ['Location', cellAt(r, hx('Location'))], ['Management Level', cellAt(r, hx('Management Level'))], ['Department', cellAt(r, hx('Department'))], ['Bank', cellAt(r, hx('Bank'))],
      ['Account Number', cellAt(r, hx('Account Number'))], ['Entity', cellAt(r, hx('Entity'))], ['PF', cellAt(r, hx('PF'))], ['PF UAN', cellAt(r, hx('PF UAN'))],
    ].filter(([, v]) => v).map(([label, value]) => ({ label, value }))
    return buildMonth(monthKey(r.cells[0].s.slice(0, 3), r.cells[0].s.slice(4)), earn, ded, { workedDays: Number(cellAt(r, hx('Worked Days'), 3)) || null, lopDays: Number(cellAt(r, hx('LOP Days'), 3)) || 0, profile })
  })
  // the register's own TOTAL row, to prove no month or amount was missed
  const totalRow = lines.find(l => l.cells[0]?.s === 'TOTAL' && l.cells.some(c => MONEY.test(c.s)))
  return { employee: emp, months, totalRow, cols }
}

// one month's figures in the shape the Salary page keeps
function buildMonth(month, earn, ded, extra = {}) {
  const sum = (m, re) => r2(Object.entries(m).filter(([k]) => re.test(k)).reduce((s, [, v]) => s + v, 0))
  const first = (m, re) => { const e = Object.entries(m).find(([k]) => re.test(k)); return e ? e[1] : 0 }
  const earnOnly = Object.fromEntries(Object.entries(earn).filter(([k]) => !/^(GROSS|TOTAL) (EARNINGS|SALARY)|^NET PAY/.test(k)))
  let gross = first(earn, /^(GROSS (EARNINGS|SALARY)|TOTAL EARNINGS)/)
  const net = first(earn, /^NET PAY/)
  const basic = first(earnOnly, /^BASIC/), hra = first(earnOnly, /HOUSE RENT|^HRA\b/)
  const bonus = sum(earnOnly, /VARIABLE PAY|LUMP SUM|BONUS|INCENTIVE|PERFORMANCE PAY|PERFORMANCE LINKED/)
  const dedOnly = Object.fromEntries(Object.entries(ded).filter(([k]) => !/^(GROSS|TOTAL) DEDUCTIONS/.test(k)))
  let grossDed = first(ded, /^(GROSS|TOTAL) DEDUCTIONS/)
  const pf = first(dedOnly, /PROVIDENT FUND|^(EPF|PF)\b/), profTax = first(dedOnly, /PROFESSIONAL TAX|^PT\b/), tds = first(dedOnly, /INCOME TAX|^TDS\b|TAX DEDUCTED/)
  if (!(gross > 0)) gross = r2(Object.values(earnOnly).reduce((s, v) => s + v, 0)) // no printed total: add the lines up
  if (!(grossDed > 0)) grossDed = r2(Object.values(dedOnly).reduce((s, v) => s + v, 0))
  const otherDed = r2(Math.max(0, grossDed - pf - profTax - tds))
  const problems = []
  if (!month) problems.push('month not found')
  if (!(net > 0)) problems.push('take-home not found')
  if (gross > 0 && net > 0 && Math.abs(gross - grossDed - net) > 1) problems.push('gross ' + gross + ' − deductions ' + grossDed + ' is not take-home ' + net)
  return { month, gross, net, basic, hra, bonus, allowances: r2(Math.max(0, gross - basic - hra - bonus)), pf, profTax, tds, otherDed, workedDays: extra.workedDays ?? null, lopDays: extra.lopDays ?? 0, components: { earnings: earnOnly, deductions: dedOnly }, profile: extra.profile || [], problems }
}

// main entry
export async function parsePayslipPdf(arrayBuffer, password, pdfjs) {
  const { doc, task } = await openPdf(arrayBuffer, password, pdfjs)
  const all = []
  for (let p = 1; p <= doc.numPages; p++) { const tc = await (await doc.getPage(p)).getTextContent(); all.push(...toLines(tc.items).map(l => ({ ...l, page: p }))) }
  await task.destroy()
  if (!all.length) throw new Error('This PDF has no readable text (it may be a scanned image). Type the figures in by hand instead.')

  const reg = parseRegister(all)
  if (reg && reg.months.length) {
    const notes = [], problems = reg.months.flatMap(m => m.problems.map(p => `${m.month || '?'}: ${p}`))
    let ok = problems.length === 0
    if (reg.totalRow) {
      // the TOTAL row's amounts line up with the same columns as the months
      for (const c of reg.cols) {
        const t = reg.totalRow.cells.find(x => Math.abs(x.x - c.x) <= 5 && MONEY.test(x.s)); if (!t) continue
        const key = c.name; const sum = r2(reg.months.reduce((s, m) => s + ((c.side === 'ded' ? m.components.deductions[key] : m.components.earnings[key]) ?? (key === 'GROSS EARNINGS' ? m.gross : key === 'NET PAY' ? m.net : key === 'GROSS DEDUCTIONS' ? (m.pf + m.profTax + m.tds + m.otherDed) : 0)), 0))
        if (key === 'GROSS EARNINGS' || key === 'NET PAY' || key === 'GROSS DEDUCTIONS') { if (Math.abs(sum - money(t.s)) > 1) { ok = false; problems.push(`${key} adds up to ${sum}, the register's TOTAL says ${money(t.s)}`) } }
      }
      if (ok) notes.push("the register's own TOTAL row agrees with the months read")
    }
    if (ok) notes.push('every month: gross earnings − deductions = take-home')
    return { kind: 'register', employer: '', employee: reg.employee, months: reg.months.sort((a, b) => a.month.localeCompare(b.month)), check: { ok, notes, problems } }
  }
  const one = parseSinglePayslip(all)
  const m = one.months[0]
  const ok = m.problems.length === 0
  return { kind: 'payslip', employer: one.employer, employee: one.employee, months: one.months, check: { ok, notes: ok ? ['gross earnings − deductions = take-home'] : [], problems: m.problems } }
}
